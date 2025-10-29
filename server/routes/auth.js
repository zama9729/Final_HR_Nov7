import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';

const router = express.Router();

// Register/Signup
router.post('/signup', async (req, res) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      orgName,
      domain,
      companySize,
      industry,
      timezone
    } = req.body;

    // Validate input
    if (!email || !password || !firstName || !orgName || !domain) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if user exists
    const existingUser = await query(
      'SELECT id FROM profiles WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Start transaction
    await query('BEGIN');

    try {
      // Create organization
      const orgResult = await query(
        `INSERT INTO organizations (name, domain, company_size, industry, timezone)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [orgName, domain, companySize || null, industry || null, timezone || 'Asia/Kolkata']
      );
      const orgId = orgResult.rows[0].id;

      // Generate user ID (UUID)
      const userIdResult = await query('SELECT gen_random_uuid() as id');
      const userId = userIdResult.rows[0].id;

      // Create profile
      await query(
        `INSERT INTO profiles (id, email, first_name, last_name, tenant_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, email, firstName, lastName, orgId]
      );

      // Create user role (CEO for first user)
      await query(
        `INSERT INTO user_roles (user_id, role, tenant_id)
         VALUES ($1, 'ceo', $2)`,
        [userId, orgId]
      );

      // Store hashed password (we'll use profiles table or create auth table)
      await query(
        `INSERT INTO user_auth (user_id, password_hash)
         VALUES ($1, $2)`,
        [userId, hashedPassword]
      );

      await query('COMMIT');

      // Generate JWT token
      const token = jwt.sign(
        { id: userId, email, role: 'ceo' },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      res.status(201).json({
        success: true,
        token,
        user: { id: userId, email, firstName, lastName, role: 'ceo' }
      });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: error.message || 'Signup failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Get user with password hash
    const userResult = await query(
      `SELECT p.id, p.email, p.first_name, p.last_name, ua.password_hash
       FROM profiles p
       JOIN user_auth ua ON ua.user_id = p.id
       WHERE p.email = $1`,
      [email.toLowerCase().trim()]
    );

    console.log('Login attempt for email:', email);
    console.log('User found:', userResult.rows.length > 0 ? 'Yes' : 'No');

    if (userResult.rows.length === 0) {
      console.log('No user found with email:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    console.log('Password valid:', validPassword);
    
    if (!validPassword) {
      console.log('Password mismatch for user:', user.email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Get user role
    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1 LIMIT 1',
      [user.id]
    );
    const role = roleResult.rows[0]?.role || 'employee';

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message || 'Login failed' });
  }
});

export default router;


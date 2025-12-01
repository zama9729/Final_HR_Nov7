    } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
}
}

runMigration();

/**
 * Smart Memo Parser
 * Parses free text into time-based calendar entries and reminders
 * NO AI - Only deterministic regex-based parsing
 */

export interface ParsedEntry {
  startDateTime: Date;
  endDateTime: Date;
  title: string;
  sourceText: string;
  mentions?: MentionReference[]; // Mentions in this entry
}

export interface MentionReference {
  employee_id: string;
  user_id: string;
  mention_text: string; // The @mention text (e.g., "@Summie")
  start_index: number; // Position in original text
  end_index: number;
}

export interface ReminderCommand {
  remindAt: Date;
  rawText: string;
}

/**
 * Extract @mentions from text
 * Returns array of mention objects with text and position
 */
export function extractMentions(text: string): Array<{ text: string; startIndex: number; endIndex: number }> {
  const mentions: Array<{ text: string; startIndex: number; endIndex: number }> = [];
  // Match @ followed by word characters (letters, numbers, underscore)
  // This will match @John, @JohnDoe, @John123, etc.
  const mentionRegex = /@(\w+)/g;
  let match;
  
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push({
      text: match[0], // Full match including @
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }
  
  return mentions;
}

/**
 * Parse smart memo text into calendar entries
 * Supports formats:
 * - HH-HH description (e.g., "11-12 in meeting")
 * - HH:MM-HH:MM description (e.g., "10:30-11:15 daily standup")
 * - H-HH description (e.g., "9-10 code review")
 * 
 * Multiple entries can be separated by commas
 */
export function parseSmartMemo(text: string, baseDate: Date): ParsedEntry[] {
  if (!text || !text.trim()) {
    return [];
  }

  const entries: ParsedEntry[] = [];
  
  // Split by comma to handle multiple entries
  const segments = text.split(',').map(s => s.trim()).filter(s => s.length > 0);
  
  for (const segment of segments) {
    // Pattern 1: HH:MM-HH:MM description
    let match = segment.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s+(.+)$/);
    if (match) {
      const [, startH, startM, endH, endM, description] = match;
      const startHour = parseInt(startH, 10);
      const startMin = parseInt(startM, 10);
      const endHour = parseInt(endH, 10);
      const endMin = parseInt(endM, 10);
      
      if (isValidTimeRange(startHour, startMin, endHour, endMin)) {
        const startDateTime = new Date(baseDate);
        startDateTime.setHours(startHour, startMin, 0, 0);
        
        const endDateTime = new Date(baseDate);
        endDateTime.setHours(endHour, endMin, 0, 0);
        
        entries.push({
          startDateTime,
          endDateTime,
          title: description.trim(),
          sourceText: segment.trim()
        });
      }
      continue;
    }
    
    // Pattern 2: HH-HH description (treat as HH:00-HH:00)
    match = segment.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s+(.+)$/);
    if (match) {
      const [, startH, endH, description] = match;
      const startHour = parseInt(startH, 10);
      const endHour = parseInt(endH, 10);
      
      if (isValidTimeRange(startHour, 0, endHour, 0)) {
        const startDateTime = new Date(baseDate);
        startDateTime.setHours(startHour, 0, 0, 0);
        
        const endDateTime = new Date(baseDate);
        endDateTime.setHours(endHour, 0, 0, 0);
        
        entries.push({
          startDateTime,
          endDateTime,
          title: description.trim(),
          sourceText: segment.trim()
        });
      }
      continue;
    }
    
    // Pattern 3: H-HH description (single digit hour)
    match = segment.match(/^(\d)\s*-\s*(\d{1,2})\s+(.+)$/);
    if (match) {
      const [, startH, endH, description] = match;
      const startHour = parseInt(startH, 10);
      const endHour = parseInt(endH, 10);
      
      if (isValidTimeRange(startHour, 0, endHour, 0)) {
        const startDateTime = new Date(baseDate);
        startDateTime.setHours(startHour, 0, 0, 0);
        
        const endDateTime = new Date(baseDate);
        endDateTime.setHours(endHour, 0, 0, 0);
        
        entries.push({
          startDateTime,
          endDateTime,
          title: description.trim(),
          sourceText: segment.trim()
        });
      }
    }
  }
  
  return entries;
}

/**
 * Validate time range - start must be before end
 */
function isValidTimeRange(startHour: number, startMin: number, endHour: number, endMin: number): boolean {
  if (startHour < 0 || startHour > 23 || startMin < 0 || startMin > 59) {
    return false;
  }
  if (endHour < 0 || endHour > 23 || endMin < 0 || endMin > 59) {
    return false;
  }
  
  const startTotal = startHour * 60 + startMin;
  const endTotal = endHour * 60 + endMin;
  
  return startTotal < endTotal;
}

/**
 * Parse reminder commands from text
 * Supports: "remind me in X minutes/hours"
 * Case-insensitive, handles singular/plural
 */
export function parseReminderCommands(text: string, baseDate: Date = new Date()): ReminderCommand[] {
  if (!text || !text.trim()) {
    return [];
  }

  const reminders: ReminderCommand[] = [];
  const normalizedText = text.toLowerCase();
  
  // Pattern: remind me in X minute(s) or remind me in X hour(s)
  // Case insensitive, handles singular/plural
  const patterns = [
    /remind\s+me\s+in\s+(\d+)\s+minute(s)?/gi,
    /remind\s+me\s+in\s+(\d+)\s+hour(s)?/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(normalizedText)) !== null) {
      const amount = parseInt(match[1], 10);
      const unit = match[0].includes('hour') ? 'hours' : 'minutes';
      const rawText = text.substring(match.index, match.index + match[0].length);
      
      if (amount > 0) {
        const remindAt = new Date(baseDate);
        if (unit === 'hours') {
          remindAt.setHours(remindAt.getHours() + amount);
        } else {
          remindAt.setMinutes(remindAt.getMinutes() + amount);
        }
        
        reminders.push({
          remindAt,
          rawText: rawText.trim()
        });
      }
    }
  }
  
  return reminders;
}

/**
 * Extract reminder text from memo, removing it from the original text
 * Returns: { cleanedText, reminders }
 */
export function extractReminders(text: string, baseDate: Date = new Date()): {
  cleanedText: string;
  reminders: ReminderCommand[];
} {
  const reminders = parseReminderCommands(text, baseDate);
  let cleanedText = text;
  
  // Remove reminder commands from text
  for (const reminder of reminders) {
    // Case-insensitive removal
    const regex = new RegExp(reminder.rawText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    cleanedText = cleanedText.replace(regex, '').trim();
    // Clean up extra commas and spaces
    cleanedText = cleanedText.replace(/,\s*,/g, ',').replace(/^\s*,\s*|\s*,\s*$/g, '').trim();
  }
  
  return { cleanedText, reminders };
}








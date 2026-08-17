/** Data shapes returned by the Amizone client. */

export interface ClassSlot {
  day: string; // "Wednesday"
  time: string; // "14:15 to 15:10"
  startTime?: string; // "14:15"
  courseCode: string; // "PFE701"
  room: string; // "I2 - 202"
  faculty?: string; // "Dr Rashmi Vashisth (307901)"
  group?: string; // "ACBS-PFE701-K"
}

export type DriveStatus = 'applied' | 'closed' | 'open' | 'unknown';

export interface PlacementDrive {
  company: string;
  startDate?: string; // "14/08/2026"
  deadline?: string; // "15/08/2026 09:00 AM"
  status: DriveStatus;
  hoursLeft?: number; // if open + parseable
}

export interface AttendanceRecord {
  course: string;
  attended: number;
  held: number;
  percent: number;
}

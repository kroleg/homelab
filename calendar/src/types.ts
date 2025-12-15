export interface CalendarConfig {
  id: string;
  name: string;
  url: string;
  color: string;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  start: string; // ISO string
  end: string; // ISO string
  allDay: boolean;
  color: string;
}

// FullCalendar event format
export interface FullCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  color: string;
  extendedProps: {
    calendarId: string;
    description?: string;
    location?: string;
  };
}

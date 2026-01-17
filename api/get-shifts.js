const { google } = require("googleapis");

const EVENT_TAG = "Managed by Schedule Assistant";

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const accessToken = req.headers.authorization.split('Bearer ')[1];
    const { calendarId } = req.body;

    // Calculate the 6-week date range on the server
    const today = new Date();
    const dayOfWeek = today.getUTCDay(); // 0 (Sun) - 6 (Sat)
    const startDate = new Date(today.getTime());
    startDate.setUTCHours(0,0,0,0);
    startDate.setUTCDate(today.getUTCDate() - dayOfWeek);
    const endDate = new Date(startDate.getTime());
    endDate.setUTCDate(startDate.getUTCDate() + 56);

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      q: EVENT_TAG,
      singleEvents: true,
    });

    const shifts = {};
    response.data.items.forEach(event => {
      // Ensure the event has a dateTime, not just a date (for all-day events)
      if (event.start.dateTime) {
          const dateKey = event.start.dateTime.split('T')[0];
          let shiftType = "NONE";
          
          // Check for exact matches first to avoid confusion
          const summary = event.summary;
          
          if (summary.includes("Work Shift")) shiftType = "W";
          
          // Check specific Call types
          if (summary.includes("Work & Call 1 Shift")) shiftType = "C1";
          if (summary.includes("Work & Call 2 Shift")) shiftType = "C2";
          
          // New Types
          if (summary.includes("Call 1 Only")) shiftType = "C1O";
          if (summary.includes("Call 2 Only")) shiftType = "C2O";
          
          shifts[dateKey] = shiftType;
      }
    });

    res.status(200).json(shifts);
  } catch (error) {
    res.status(500).json({ message: `Error fetching shifts: ${error.message}` });
  }
};
const { google } = require("googleapis");

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
    const { calendarId, startDate, endDate } = req.body;

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: startDate,
      timeMax: endDate,
      q: '"Work Shift" OR "Call 1 Shift" OR "Call 2 Shift"', // Search for any of the shift titles
      singleEvents: true,
    });

    const shifts = {};
    response.data.items.forEach(event => {
      const dateKey = event.start.dateTime.split('T')[0];
      let shiftType = "NONE";
      if (event.summary.includes("Work Shift")) shiftType = "W";
      if (event.summary.includes("Call 1 Shift")) shiftType = "C1";
      if (event.summary.includes("Call 2 Shift")) shiftType = "C2";
      
      shifts[dateKey] = shiftType;
    });

    res.status(200).json(shifts);
  } catch (error) {
    res.status(500).json({ message: `Error fetching shifts: ${error.message}` });
  }
};
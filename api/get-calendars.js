const { google } = require("googleapis");

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const accessToken = req.headers.authorization.split('Bearer ')[1];
    if (!accessToken) {
        return res.status(401).json({ message: 'Authorization token not found.' });
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const calListRes = await calendar.calendarList.list();
    const editableCalendars = calListRes.data.items.filter(cal => 
      cal.accessRole === 'writer' || cal.accessRole === 'owner'
    );
    // Use 'summary' to match the frontend's expectation in populateCalendarSelect
    const calendarList = editableCalendars.map(cal => ({ id: cal.id, summary: cal.summary })); 
    res.status(200).json(calendarList);
  } catch (error) {
    res.status(500).json({ message: `Error fetching calendars: ${error.message}` });
  }
};
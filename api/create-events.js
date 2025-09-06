const { google } = require("googleapis");

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Only POST requests are allowed' });
  }

  try {
    const accessToken = req.headers.authorization.split('Bearer ')[1];
    const { formObject } = req.body;

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const calendarId = formObject.calendarId;
    if (!calendarId) {
      return res.status(400).json({ message: 'No calendar was selected.' });
    }

    const promises = [];
    let createdCount = 0;
    for (const key in formObject) {
      if (key.startsWith("shift_")) {
        const shiftType = formObject[key];
        const isoDateString = key.substring(6);
        const shiftDetails = getShiftTimes(isoDateString, shiftType);

        promises.push(
          calendar.events.insert({
            calendarId: calendarId,
            resource: {
              summary: shiftDetails.title,
              start: { dateTime: shiftDetails.startTime.toISOString() },
              end: { dateTime: shiftDetails.endTime.toISOString() },
            },
          })
        );
        createdCount++;
      }
    }
    await Promise.all(promises);
    return res.status(200).json({ message: `Success! Created ${createdCount} events.` });
  } catch (error) {
    return res.status(500).json({ message: `Could not create events: ${error.message}` });
  }
};


function getShiftTimes(isoDateString, shiftType) {
  // ... (This helper function remains the same as the last version)
  const date = new Date(isoDateString + "T12:00:00Z");
  const dayOfWeek = date.getUTCDay();
  const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

  let title, startTime, endTime;

  const W_START_HOUR_UTC = 13;
  const W_END_HOUR_UTC = 23;
  const W_END_MINUTE_UTC = 30;
  const C_START_WEEKEND_UTC = 11;
  const C_START_WEEKDAY_UTC = 13;
  const C_END_HOUR_UTC = 11;

  switch (shiftType) {
    case 'W':
      title = "Work Shift";
      startTime = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), W_START_HOUR_UTC, 0, 0));
      endTime = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), W_END_HOUR_UTC, W_END_MINUTE_UTC, 0));
      break;
    case 'C1':
    case 'C2':
      title = (shiftType === 'C1') ? "Call 1 Shift" : "Call 2 Shift";
      const nextDay = new Date(date);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);

      endTime = new Date(Date.UTC(nextDay.getUTCFullYear(), nextDay.getUTCMonth(), nextDay.getUTCDate(), C_END_HOUR_UTC, 0, 0));

      if (isWeekend) {
        startTime = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), C_START_WEEKEND_UTC, 0, 0));
      } else { 
        startTime = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), C_START_WEEKDAY_UTC, 0, 0));
      }
      break;
  }
  return { title, startTime, endTime };
}
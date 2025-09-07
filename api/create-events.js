const { google } = require("googleapis");

const EVENT_TAG = "Managed by Schedule Assistant";

module.exports = async (req, res) => {
  // CORS headers...
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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

    const today = new Date();
    const dayOfWeek = today.getUTCDay();
    const daysUntilSunday = (7 - dayOfWeek) % 7;
    const startDate = new Date(today.getTime());
    startDate.setUTCHours(0,0,0,0);
    startDate.setUTCDate(today.getUTCDate() + daysUntilSunday);
    const endDate = new Date(startDate.getTime());
    endDate.setUTCDate(startDate.getUTCDate() + 42);

    const existingEvents = await calendar.events.list({
      calendarId: calendarId,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      q: EVENT_TAG,
      singleEvents: true,
    });

    const deletePromises = existingEvents.data.items.map(event => 
      calendar.events.delete({ calendarId: calendarId, eventId: event.id })
    );
    await Promise.all(deletePromises);

    const createPromises = [];
    let createdCount = 0;
    for (const key in formObject) {
      if (key.startsWith("shift_")) {
        const shiftType = formObject[key];
        if (shiftType !== 'NONE') {
            const isoDateString = key.substring(6);
            const shiftDetails = getShiftTimes(isoDateString, shiftType);

            createPromises.push(
              calendar.events.insert({
                calendarId: calendarId,
                resource: {
                  summary: `${shiftDetails.title} [${EVENT_TAG}]`,
                  description: EVENT_TAG,
                  start: { dateTime: shiftDetails.startTime.toISOString() },
                  end: { dateTime: shiftDetails.endTime.toISOString() },
                },
              })
            );
            createdCount++;
        }
      }
    }
    await Promise.all(createPromises);
    return res.status(200).json({ message: `Success! Synced ${createdCount} events.` });

  } catch (error) {
    return res.status(500).json({ message: `Could not sync events: ${error.message}` });
  }
};

function getShiftTimes(isoDateString, shiftType) {
    const date = new Date(isoDateString + "T12:00:00Z");
    const dayOfWeek = date.getUTCDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    let title, startTime, endTime;
    const W_START_HOUR_UTC = 13, W_END_HOUR_UTC = 23, W_END_MINUTE_UTC = 30;
    const C_START_WEEKEND_UTC = 11, C_START_WEEKDAY_UTC = 13, C_END_HOUR_UTC = 11;
    switch (shiftType) {
        case 'W':
            title = "Work Shift";
            startTime = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), W_START_HOUR_UTC, 0, 0));
            endTime = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), W_END_HOUR_UTC, W_END_MINUTE_UTC, 0));
            break;
        case 'C1': case 'C2':
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
const { google } = require("googleapis");

const EVENT_TAG = "Managed by Schedule Assistant";
const TIME_ZONE = "America/New_York"; // Sets the rule for the whole app

module.exports = async (req, res) => {
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
    if (!calendarId) return res.status(400).json({ message: 'No calendar was selected.' });

    // 1. Calculate Date Range (Same as before)
    const today = new Date();
    const dayOfWeek = today.getUTCDay();
    const daysUntilSunday = (7 - dayOfWeek) % 7;
    const startDate = new Date(today.getTime());
    startDate.setUTCHours(0,0,0,0);
    startDate.setUTCDate(today.getUTCDate() + daysUntilSunday);
    const endDate = new Date(startDate.getTime());
    endDate.setUTCDate(startDate.getUTCDate() + 42);

    // 2. Delete Existing Events
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

    // 3. Create New Events
    const createPromises = [];
    let createdCount = 0;
    
    for (const key in formObject) {
      if (key.startsWith("shift_")) {
        const shiftType = formObject[key];
        if (shiftType !== 'NONE') {
            const dateString = key.substring(6); // "2023-12-25"
            const shiftDetails = getShiftDefinition(shiftType);

            if (shiftDetails) {
                createPromises.push(
                  calendar.events.insert({
                    calendarId: calendarId,
                    resource: {
                      summary: `${shiftDetails.title} [${EVENT_TAG}]`,
                      description: EVENT_TAG,
                      // HERE IS THE TIMEZONE FIX:
                      start: { 
                          dateTime: `${dateString}T${shiftDetails.startTime}`, 
                          timeZone: TIME_ZONE 
                      },
                      end: { 
                          dateTime: `${dateString}T${shiftDetails.endTime}`, 
                          timeZone: TIME_ZONE 
                      },
                    },
                  })
                );
                createdCount++;
            }
        }
      }
    }
    await Promise.all(createPromises);
    return res.status(200).json({ message: `Success! Synced ${createdCount} events.` });

  } catch (error) {
    return res.status(500).json({ message: `Could not sync events: ${error.message}` });
  }
};

// Simplified Logic: No more UTC math. Just "Wall Clock" time.
function getShiftDefinition(shiftType) {
    let title, startTime, endTime;

    switch (shiftType) {
        case 'W':
            title = "Work Shift";
            startTime = "09:00:00";
            endTime = "19:30:00"; 
            break;
        case 'C1': 
            title = "Work & Call 1 Shift";
            startTime = "09:00:00";
            endTime = "23:59:00";
            break;
        case 'C2':
            title = "Work & Call 2 Shift";
            startTime = "09:00:00";
            endTime = "23:59:00";
            break;
        // --- NEW SHIFTS ---
        case 'C1O':
            title = "Call 1 Only";
            startTime = "21:00:00"; // 9:00 PM
            endTime = "23:59:00";   // 11:59 PM
            break;
        case 'C2O':
            title = "Call 2 Only";
            startTime = "21:00:00"; // 9:00 PM
            endTime = "23:59:00";   // 11:59 PM
            break;
        default:
            return null;
    }
    return { title, startTime, endTime };
}
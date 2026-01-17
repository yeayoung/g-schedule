const { google } = require("googleapis");

const EVENT_TAG = "Managed by Schedule Assistant";
const TIME_ZONE = "America/New_York";

module.exports = async (req, res) => {
  // ... CORS and Auth headers (same as before) ...
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const accessToken = req.headers.authorization.split('Bearer ')[1];
    const { formObject, ranges } = req.body; // <--- Extract 'ranges'

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    
    const calendarId = formObject.calendarId;
    if (!calendarId) return res.status(400).json({ message: 'No calendar selected.' });
    if (!ranges || ranges.length === 0) return res.status(400).json({ message: 'No weeks selected.' });

    // 1. Delete Existing Events (ONLY in selected ranges)
    const deletePromises = [];
    
    for (const range of ranges) {
        // Construct time boundaries for this specific week
        const timeMin = `${range.start}T00:00:00`; 
        const timeMax = `${range.end}T23:59:59`; 

        // We use the 'primary' timezone of the calendar for the query, 
        // effectively asking: "Events occurring on these wall-clock days"
        const listRes = await calendar.events.list({
          calendarId: calendarId,
          timeMin: new Date(timeMin).toISOString(), // Roughly convert to ISO for API
          timeMax: new Date(timeMax).toISOString(),
          q: EVENT_TAG,
          singleEvents: true,
        });

        // Add delete requests to the pile
        listRes.data.items.forEach(event => {
            deletePromises.push(calendar.events.delete({ calendarId: calendarId, eventId: event.id }));
        });
    }
    
    // Wait for all deletions to finish
    await Promise.all(deletePromises);

    // 2. Create New Events
    // We iterate through the formObject, but we MUST check if the date
    // falls into one of our selected ranges.
    const createPromises = [];
    let createdCount = 0;
    
    for (const key in formObject) {
      if (key.startsWith("shift_")) {
        const shiftType = formObject[key];
        const dateString = key.substring(6); // "2023-12-25"
        
        // Check if this date is inside any of the selected ranges
        const isRwritable = ranges.some(r => dateString >= r.start && dateString <= r.end);

        if (isRwritable && shiftType !== 'NONE') {
            const shiftDetails = getShiftDefinition(shiftType);
            if (shiftDetails) {
                createPromises.push(
                  calendar.events.insert({
                    calendarId: calendarId,
                    resource: {
                      summary: `${shiftDetails.title} [${EVENT_TAG}]`,
                      description: EVENT_TAG,
                      start: { dateTime: `${dateString}T${shiftDetails.startTime}`, timeZone: TIME_ZONE },
                      end: { dateTime: `${dateString}T${shiftDetails.endTime}`, timeZone: TIME_ZONE },
                    },
                  })
                );
                createdCount++;
            }
        }
      }
    }
    await Promise.all(createPromises);
    return res.status(200).json({ message: `Success! Synced ${createdCount} events in ${ranges.length} weeks.` });

  } catch (error) {
    return res.status(500).json({ message: `Sync failed: ${error.message}` });
  }
};

// ... (getShiftDefinition function remains the same) ...
function getShiftDefinition(shiftType) {
    let title, startTime, endTime;
    switch (shiftType) {
        case 'W':   title = "Work Shift"; startTime = "09:00:00"; endTime = "19:30:00"; break;
        case 'C1':  title = "Work & Call 1 Shift"; startTime = "09:00:00"; endTime = "23:59:00"; break;
        case 'C2':  title = "Work & Call 2 Shift"; startTime = "09:00:00"; endTime = "23:59:00"; break;
        case 'C1O': title = "Call 1 Only"; startTime = "21:00:00"; endTime = "23:59:00"; break;
        case 'C2O': title = "Call 2 Only"; startTime = "21:00:00"; endTime = "23:59:00"; break;
        default: return null;
    }
    return { title, startTime, endTime };
}
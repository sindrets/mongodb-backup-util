import { printNextInvocations, scheduleJobUtc, TimeRange } from "misc/ScheduleJobUtc";

scheduleJobUtc("test job", {
		month: 2,
		date: 31,
		hour: 23,
		minute: 30,
		second: 0,
		dayOfWeek: [5,6]
	}, 3, () => {
	
	}
);

scheduleJobUtc("weekend announcement", {
		hour: 16,
		minute: 0,
		second: 0,
		dayOfWeek: 5
	}, 1, () => {

	}
)

scheduleJobUtc("work days", {
		hour: 12,
		minute: 0,
		second: 0,
		dayOfWeek: new TimeRange(1, 5)
	}, 0, () => {
		
	}
)

printNextInvocations();


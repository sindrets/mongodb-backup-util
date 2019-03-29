import moment, { Moment } from "moment";
import schedule, { Job } from "node-schedule";
import { Utils } from "./Utils";

export type RecurrenceDef = number | number[] | TimeRange;

export interface JobSpec {
    year?: RecurrenceDef, 
    month?: RecurrenceDef, 
    date?: RecurrenceDef,
    hour?: RecurrenceDef, 
    minute?: RecurrenceDef, 
    second?: RecurrenceDef, 
    dayOfWeek?: RecurrenceDef
}

export class TimeRange {

    public start: number;
    public end: number;
    public step: number;

    constructor(start: number, end: number, step=1) {
        this.start = start;
        this.end = end;
        this.step = step;
    }
    
}

export function scheduleJobUtc(name: string, spec: JobSpec, utcOffset: number, callback: () => void): Job {

    let valueToArray = (value?: number | number[] | TimeRange): number[] => {
        
        let result: number[] = [];

        if (value == undefined) return result;
        if (typeof value == "number") return [value];
        if (value instanceof Array) return value;
        else {
            for (let i = 0; i < value.end; i += value.step) {
                result.push(value.start + i);
            }
        }

        return result;

    }

    if (spec.second == undefined) spec.second = 0;

    let values = {
        year: valueToArray(spec.year),
        month: valueToArray(spec.month),
        date: valueToArray(spec.date),
        hour: valueToArray(spec.hour),
        minute: valueToArray(spec.minute),
        second: valueToArray(spec.second),
        dayOfWeek: valueToArray(spec.dayOfWeek)
    }

    let t0: Moment;
    let t1: Moment = moment.utc();

    if (spec.year != undefined) t1.set("year", values.year[0]);
    if (spec.month != undefined) t1.set("month", values.month[0]);
    if (spec.date != undefined) t1.set("date", values.date[0]);
    if (spec.hour != undefined) t1.set("hour", values.hour[0]);
    if (spec.minute != undefined) t1.set("minute", values.minute[0]);
    if (spec.second != undefined) t1.set("second", values.second[0]);

    let currentOffset = new Date().getTimezoneOffset();
    t0 = t1.clone();
    t1.add((currentOffset + (utcOffset * 60)) / 60, "hours");

    let diffs: { [key: string]: number } = {

        year: (() => {
            let t2 = t0.clone().set("months", 0).set("date", 1).set("hours", 0).set("minutes", 0).set("seconds", 0);
            let t3 = t1.clone().set("months", 0).set("date", 1).set("hours", 0).set("minutes", 0).set("seconds", 0);
            return t3.diff(t2, "years", true);
        })(),

        month: (() => {
            let t2 = t0.clone().set("date", 1).set("hours", 0).set("minutes", 0).set("seconds", 0);
            let t3 = t1.clone().set("date", 1).set("hours", 0).set("minutes", 0).set("seconds", 0);
            return t3.diff(t2, "months", true);
        })(),

        date: (() => {
            let t2 = t0.clone().set("hours", 0).set("minutes", 0).set("seconds", 0);
            let t3 = t1.clone().set("hours", 0).set("minutes", 0).set("seconds", 0);
            return t3.diff(t2, "days", true);
        })(),

        hour: (() => {
            let t2 = t0.clone().set("minutes", 0).set("seconds", 0);
            let t3 = t1.clone().set("minutes", 0).set("seconds", 0);
            return t3.diff(t2, "hours", true);
        })(),

        minute: (() => {
            let t2 = t0.clone().set("year", 2000).set("months", 0).set("date", 1).set("hours", 0).set("seconds", 0);
            let t3 = t1.clone().set("year", 2000).set("months", 0).set("date", 1).set("hours", 0).set("seconds", 0);
            return t3.diff(t2, "minutes", true);
        })(),

        second: (() => {
            let t2 = t0.clone().set("year", 2000).set("months", 0).set("date", 1).set("hours", 0).set("minutes", 0);
            let t3 = t1.clone().set("year", 2000).set("months", 0).set("date", 1).set("hours", 0).set("minutes", 0);
            return t3.diff(t2, "seconds", true);
        })(),

        dayOfWeek: (() => {
            let t2 = t0.clone().set("hours", 0).set("minutes", 0).set("seconds", 0);
            let t3 = t1.clone().set("hours", 0).set("minutes", 0).set("seconds", 0);
            return t3.diff(t2, "days", true);
        })()

    }

    Utils.objForEach(values, (v, k) => {

        let value: number[] = v;
        let key: string = k;
        let t2 = t0.clone();

        if (key != "dayOfWeek") {
            value.forEach((time, index) => {
                value[index] = t2.set(key as any, time + diffs[key]).get(key as any);
            })
        }
        else {
            //dayOfWeek
            value.forEach((time, index) => {
                value[index] = (time + diffs[key]) % 7;
            })
        }

    })

    let rule = new schedule.RecurrenceRule();
    if (spec.year != undefined) rule.year = values.year;
    if (spec.month != undefined) rule.month = values.month;
    if (spec.date != undefined) rule.date = values.date;
    if (spec.hour != undefined) rule.hour = values.hour;
    if (spec.minute != undefined) rule.minute = values.minute;
    if (spec.second != undefined) rule.second = values.second;
    if (spec.dayOfWeek != undefined) rule.dayOfWeek = values.dayOfWeek;

    return schedule.scheduleJob(name, rule, callback);

}
export const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
export const START = 6 * 60;
export const END = 20 * 60;

export function timeLabel(minute) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function durationLabel(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours}h` : "", rest ? `${rest}m` : ""].filter(Boolean).join(" ") || "0h";
}

export function validateData(data) {
  if (data?.schema_version !== 1 || !Array.isArray(data.members) || !data.members.length || data.member_count !== data.members.length) {
    throw new Error("The availability export is incomplete or unsupported. Please contact the site owner.");
  }
  const ids = new Set();
  for (const member of data.members) {
    if (typeof member.id !== "string" || !member.id || typeof member.name !== "string" || !member.name.trim() || ids.has(member.id)) {
      throw new Error("The export contains an invalid or duplicate member.");
    }
    ids.add(member.id);
    for (const day of DAYS) {
      const value = member.days?.[day];
      if (!value || !Array.isArray(value.source_unavailable) || !Array.isArray(value.available) || !Array.isArray(value.unavailable)) {
        throw new Error(`Missing ${day} data for ${member.name}. Please contact the site owner.`);
      }
      const coverage = [...value.available, ...value.unavailable].sort((a, b) => a.start_minute - b.start_minute);
      let cursor = 0;
      for (const range of coverage) {
        if (!Number.isInteger(range.start_minute) || !Number.isInteger(range.end_minute) || range.start_minute !== cursor || range.end_minute <= cursor || range.end_minute > 1440) {
          throw new Error(`Invalid time ranges for ${member.name} on ${day}. Please contact the site owner.`);
        }
        cursor = range.end_minute;
      }
      if (cursor !== 1440) throw new Error(`Incomplete ${day} for ${member.name}.`);
    }
  }
  return data;
}

// Split at actual boundaries rather than rounding to the half-hour grid.
export function daySegments(members, day, start = START, end = END) {
  if (!members.length) return [];
  const boundaries = new Set([start, end]);
  for (const member of members) {
    for (const range of member.days[day].unavailable) {
      if (range.start_minute < end && range.end_minute > start) {
        boundaries.add(Math.max(start, range.start_minute));
        boundaries.add(Math.min(end, range.end_minute));
      }
    }
  }
  const points = [...boundaries].sort((a, b) => a - b);
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const left = points[i], right = points[i + 1];
    const busyIds = members.filter(member => member.days[day].unavailable.some(range => range.start_minute < right && range.end_minute > left)).map(member => member.id);
    const previous = segments.at(-1);
    if (previous && previous.busyIds.length === busyIds.length && previous.busyIds.every((id, index) => id === busyIds[index])) {
      previous.end = right;
    } else {
      segments.push({ start: left, end: right, busyIds });
    }
  }
  return segments;
}

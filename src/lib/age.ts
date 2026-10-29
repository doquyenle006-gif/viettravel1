export function ageOn(dob: string, onDate: string): number {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [y, m, d] = onDate.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export function classify(dob: string, departureDate: string, infantMax: number, childMax: number): "adult" | "child" | "infant" {
  const age = ageOn(dob, departureDate);
  if (age < infantMax) return "infant";
  if (age < childMax) return "child";
  return "adult";
}

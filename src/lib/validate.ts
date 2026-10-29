import { ageOn, classify } from "./age";
import type { IsoDate, PassengerType } from "../types";

export function classLabel(type: PassengerType): string {
  if (type === "adult") return "Người lớn";
  if (type === "child") return "Trẻ em";
  return "Em bé";
}

export function classifyPassenger(dob: IsoDate, departureDate: IsoDate, infantMax: number, childMax: number): PassengerType {
  return classify(dob, departureDate, infantMax, childMax);
}

export function passengerAge(dob: IsoDate, departureDate: IsoDate): number {
  return ageOn(dob, departureDate);
}

export function ageBandLabel(infantMax: number, childMax: number): string {
  return `Em bé dưới ${infantMax} tuổi · Trẻ em ${infantMax}–${childMax - 1} tuổi · Người lớn từ ${childMax} tuổi`;
}

export function validDob(dob: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dob) && dob <= new Date().toISOString().slice(0, 10);
}

export function normalizePhoneInput(value: string): string {
  let phone = value.replace(/[\s.\-()]/g, "");
  if (phone.startsWith("+84")) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith("84") && phone.length >= 10) phone = `0${phone.slice(2)}`;
  return phone;
}

export function validPhone(value: string): boolean {
  return /^0\d{8,10}$/.test(normalizePhoneInput(value));
}

export function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  const labels = ["Rất yếu", "Yếu", "Trung bình", "Mạnh", "Rất mạnh"];
  return { score: Math.min(4, score) as 0 | 1 | 2 | 3 | 4, label: labels[Math.min(4, score)] };
}

export function taxCodeValid(value: string): boolean {
  return /^\d{10}(-\d{3})?$/.test(value);
}

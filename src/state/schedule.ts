// src/state/schedule.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Period = {
  id: string;          // e.g., "p1"
  label: string;       // e.g., "Math"
  startMin: number;    // minutes since midnight
  endMin: number;      // minutes since midnight
  classId: string;     // used to route into the correct classroom/lesson
};

type ScheduleState = {
  periods: Period[];
  activePeriodId?: string;
  isInClass: boolean;          // true once the player “sits” in class
  hasPassedFive: boolean;      // true after 5 questions in the *current* period
  lastBellTs?: number;         // ms timestamp of last bell
  nextBellTs?: number;         // ms timestamp of next bell

  // Derived
  canBuild: () => boolean;     // allowed to go outside/build?

  // Actions
  setSchedule: (periods: Period[]) => void;
  tick: (now: number) => void; // call on an interval to update bells
  enterClass: (classId: string) => void;
  leaveClass: () => void;
  markFivePassed: () => void;  // call from Quiz after 5 correct
  resetForNewPeriod: () => void;

  // Helpers
  getActivePeriod: (now: Date) => Period | undefined;
};

// --- Helpers ---
function hmToMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Default 7-period day (you can overwrite via setSchedule)
const DEFAULT_PERIODS: Period[] = [
  { id: "p1", label: "Homeroom", classId: "HOMEROOM", startMin: hmToMin("08:00"), endMin: hmToMin("08:10") },
  { id: "p2", label: "Math",     classId: "MATH",     startMin: hmToMin("08:12"), endMin: hmToMin("08:40") },
  { id: "p3", label: "ELA",      classId: "ELA",      startMin: hmToMin("08:42"), endMin: hmToMin("09:10") },
  { id: "p4", label: "Science",  classId: "SCI",      startMin: hmToMin("09:12"), endMin: hmToMin("09:40") },
  { id: "p5", label: "Social",   classId: "SOC",      startMin: hmToMin("09:42"), endMin: hmToMin("10:10") },
  { id: "p6", label: "Lunch",    classId: "LUNCH",    startMin: hmToMin("10:12"), endMin: hmToMin("10:40") },
  { id: "p7", label: "Elective", classId: "ELECT",    startMin: hmToMin("10:42"), endMin: hmToMin("11:10") },
];

// Returns minutes since midnight local time
function minutesSinceMidnight(d = new Date()) {
  return d.getHours() * 60 + d.getMinutes();
}

function computeActive(periods: Period[], now: Date) {
  const mins = minutesSinceMidnight(now);
  return periods.find(p => mins >= p.startMin && mins < p.endMin);
}

function computeNextBell(periods: Period[], now: Date) {
  const mins = minutesSinceMidnight(now);
  const upcoming = periods
    .map(p => p.endMin)
    .filter(end => end > mins)
    .sort((a, b) => a - b)[0];
  if (upcoming === undefined) return undefined;
  const today = new Date(now);
  const h = Math.floor(upcoming / 60);
  const m = upcoming % 60;
  const bell = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    h,
    m,
    0,
    0
  );
  return bell.getTime();
}

export const useSchedule = create<ScheduleState>()(
  persist(
    (set, get) => ({
      periods: DEFAULT_PERIODS,
      activePeriodId: undefined,
      isInClass: false,
      hasPassedFive: false,
      lastBellTs: undefined,
      nextBellTs: undefined,

      canBuild: () => {
        const { isInClass, hasPassedFive } = get();
        // You can build if (1) you aren't in class, or (2) you passed 5 in the current period
        return !isInClass || hasPassedFive;
      },

      setSchedule: (periods) => {
        const now = new Date();
        const active = computeActive(periods, now);
        set({
          periods,
          activePeriodId: active?.id,
          nextBellTs: computeNextBell(periods, now),
        });
      },

      tick: (nowMs) => {
        const now = new Date(nowMs);
        const { periods, activePeriodId, nextBellTs } = get();
        const active = computeActive(periods, now);

        // Handle period transitions (bell rings)
        if (nextBellTs !== undefined && nowMs >= nextBellTs) {
          // Bell just rang
          set({
            lastBellTs: nextBellTs,
            nextBellTs: computeNextBell(periods, now),
          });
          // Reset class state for new period
          get().resetForNewPeriod();
        }

        // Keep activePeriodId in sync with real time
        if (active?.id !== activePeriodId) {
          set({ activePeriodId: active?.id });
        }
      },

      enterClass: (classId) => {
        const { periods } = get();
        const active = get().getActivePeriod(new Date());
        // Only allow "enter" if they walked into the correct class for the active period
        if (active && active.classId === classId) {
          set({ isInClass: true });
        } else {
          // If they enter wrong class, we still allow sit, but lesson shouldn't start
          set({ isInClass: true });
        }
      },

      leaveClass: () => set({ isInClass: false }),

      markFivePassed: () => set({ hasPassedFive: true }),

      resetForNewPeriod: () =>
        set({
          isInClass: false,
          hasPassedFive: false,
        }),

      getActivePeriod: (now: Date) => {
        const { periods } = get();
        return computeActive(periods, now);
      },
    }),
    {
      name: "eduverse-schedule-v1",
      partialize: (s) => ({
        periods: s.periods,
        activePeriodId: s.activePeriodId,
        lastBellTs: s.lastBellTs,
        nextBellTs: s.nextBellTs,
        // Persisting hasPassedFive/isInClass across refresh isn't needed; they reset each period
      }),
    }
  )
);

// Optional: simple loop starter (call this once from App on mount)
let _interval: number | null = null;
export function startBellLoop(intervalMs = 1000) {
  if (typeof window === "undefined") return;
  if (_interval) window.clearInterval(_interval);
  _interval = window.setInterval(() => {
    useSchedule.getState().tick(Date.now());
  }, intervalMs);
}
export function stopBellLoop() {
  if (typeof window === "undefined") return;
  if (_interval) window.clearInterval(_interval);
  _interval = null;
}

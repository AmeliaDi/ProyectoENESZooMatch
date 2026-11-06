import { describe, expect, it } from "vitest";

import {
  detectDuplicateGroups,
  planDuplicateMerge,
  selectSurvivor,
  type MergeCandidateProfile,
} from "./duplicate-merge";

const BASE_CANDIDATE: MergeCandidateProfile = {
  userId: "00000000-0000-4000-8000-000000000001",
  key: "hash-a",
  quizCompletedAt: null,
  completedModulesCount: 0,
  answersCount: 0,
  updatedAt: "2026-10-01T00:00:00.000Z",
  eliminadoEn: null,
};

describe("selectSurvivor", () => {
  it("prefers a completed quiz over an incomplete profile regardless of timestamp", () => {
    const incompleteRecent: MergeCandidateProfile = {
      ...BASE_CANDIDATE,
      userId: "00000000-0000-4000-8000-000000000001",
      quizCompletedAt: null,
      updatedAt: "2026-10-05T00:00:00.000Z",
    };
    const completedOlder: MergeCandidateProfile = {
      ...BASE_CANDIDATE,
      userId: "00000000-0000-4000-8000-000000000002",
      quizCompletedAt: "2026-10-02T00:00:00.000Z",
      answersCount: 42,
      updatedAt: "2026-10-02T00:00:00.000Z",
    };

    const { survivor, duplicates } = selectSurvivor([incompleteRecent, completedOlder]);
    expect(survivor.userId).toBe(completedOlder.userId);
    expect(duplicates.map((d) => d.userId)).toEqual([incompleteRecent.userId]);
  });

  it("prefers more completed modules and more answers, breaking ties by most recent updatedAt", () => {
    const a: MergeCandidateProfile = {
      ...BASE_CANDIDATE,
      userId: "00000000-0000-4000-8000-000000000001",
      quizCompletedAt: "2026-10-02T00:00:00.000Z",
      completedModulesCount: 1,
      answersCount: 50,
      updatedAt: "2026-10-04T00:00:00.000Z",
    };
    const b: MergeCandidateProfile = {
      ...BASE_CANDIDATE,
      userId: "00000000-0000-4000-8000-000000000002",
      quizCompletedAt: "2026-10-02T00:00:00.000Z",
      completedModulesCount: 3,
      answersCount: 68,
      updatedAt: "2026-10-03T00:00:00.000Z",
    };

    const { survivor } = selectSurvivor([a, b]);
    expect(survivor.userId).toBe(b.userId);
  });
});

describe("detectDuplicateGroups & planDuplicateMerge", () => {
  it("groups only active profiles sharing a normalized key and plans ordered match/signal/chat reassignments", () => {
    const profiles: MergeCandidateProfile[] = [
      {
        ...BASE_CANDIDATE,
        userId: "00000000-0000-4000-8000-00000000000b",
        key: "  HASH-1 ",
        quizCompletedAt: null,
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
      {
        ...BASE_CANDIDATE,
        userId: "00000000-0000-4000-8000-00000000000a",
        key: "hash-1",
        quizCompletedAt: "2026-10-02T00:00:00.000Z",
        completedModulesCount: 2,
        answersCount: 54,
        updatedAt: "2026-10-02T00:00:00.000Z",
      },
      {
        ...BASE_CANDIDATE,
        userId: "00000000-0000-4000-8000-00000000000c",
        key: "hash-2",
        quizCompletedAt: "2026-10-02T00:00:00.000Z",
      },
    ];

    const groups = detectDuplicateGroups(profiles);
    expect(groups).toHaveLength(1);
    const plan = planDuplicateMerge(groups[0]!, {
      matches: [
        // Counterpart 000c with duplicate 000b: when reassigned to 000a, must be ordered (000a < 000c)
        { track: "romance", userA: "00000000-0000-4000-8000-00000000000b", userB: "00000000-0000-4000-8000-00000000000c", similarity: 0.81 },
        // Self-match between survivor 000a and duplicate 000b must be dropped
        { track: "amistad", userA: "00000000-0000-4000-8000-00000000000a", userB: "00000000-0000-4000-8000-00000000000b", similarity: 0.65 },
      ],
    });

    expect(plan.survivorId).toBe("00000000-0000-4000-8000-00000000000a");
    expect(plan.softDeleteIds).toEqual(["00000000-0000-4000-8000-00000000000b"]);
    expect(plan.reassignedMatches).toEqual([
      {
        track: "romance",
        userA: "00000000-0000-4000-8000-00000000000a",
        userB: "00000000-0000-4000-8000-00000000000c",
        similarity: 0.81,
      },
    ]);
    expect(plan.droppedSelfMatches).toBe(1);
  });
});


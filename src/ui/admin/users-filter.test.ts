import { describe, expect, it } from "vitest";

import { ADMIN_ORDERS, adminUserFilterSchema } from "@/contracts/admin";

import { FACET_SELECTS, ORDEN_LABELS } from "./admin-copy";
import { MBTI_CODES } from "./metrics-export";

import {
  ALL,
  ORDER_CYCLE,
  activeFacetCount,
  nextOrder,
  selectValue,
  soloAdminFromSelect,
  sortColumnOf,
  sortDirection,
  withFacet,
} from "./users-filter";

describe("sort cycles", () => {
  it("only offers orders the base whitelists", () => {
    for (const cycle of Object.values(ORDER_CYCLE)) {
      for (const order of cycle) expect(ADMIN_ORDERS).toContain(order);
    }
    expect(ADMIN_ORDERS.every((order) => Object.values(ORDER_CYCLE).some((cycle) => cycle.includes(order)))).toBe(true);
  });

  it("starts a column on its first order and flips on the second click", () => {
    expect(nextOrder("fecha", undefined)).toBe("recientes");
    expect(nextOrder("fecha", "recientes")).toBe("antiguas");
    expect(nextOrder("fecha", "antiguas")).toBe("recientes");
    expect(nextOrder("afinidades", "recientes")).toBe("masAfinidades");
  });

  it("keeps the single-valued columns steady", () => {
    expect(nextOrder("nombre", undefined)).toBe("nombre");
    expect(nextOrder("nombre", "nombre")).toBe("nombre");
  });

  it("names the header that owns the current order", () => {
    expect(sortColumnOf(undefined)).toBeNull();
    expect(sortColumnOf("masAfinidades")).toBe("afinidades");
    expect(sortColumnOf("antiguas")).toBe("fecha");
    expect(sortColumnOf("nombre")).toBe("nombre");
  });
});

describe("facet merging", () => {
  it("removes a facet returned to todos instead of writing undefined", () => {
    const filter = withFacet({ estado: "huevo" }, "estado", undefined);
    expect(filter).toEqual({});
    expect(Object.prototype.hasOwnProperty.call(filter, "estado")).toBe(false);
  });

  it("replaces one facet and leaves the rest untouched", () => {
    expect(withFacet({ estado: "eclosionado", mbti: "ENFP" }, "estado", "huevo")).toEqual({ estado: "huevo", mbti: "ENFP" });
  });

  it("keeps the admin-only facet a boolean, which is what the route encodes", () => {
    expect(withFacet({}, "soloAdmin", soloAdminFromSelect("si"))).toEqual({ soloAdmin: true });
  });

  it("counts only what is narrowing the list", () => {
    expect(activeFacetCount({})).toBe(0);
    expect(activeFacetCount({ estado: "huevo", orden: "recientes" })).toBe(2);
  });
});

describe("sort direction", () => {
  it("reads newest and most-affinities as descending", () => {
    expect(sortDirection("recientes")).toBe("descending");
    expect(sortDirection("masAfinidades")).toBe("descending");
    expect(sortDirection("antiguas")).toBe("ascending");
    expect(sortDirection("menosAfinidades")).toBe("ascending");
    expect(sortDirection("nombre")).toBe("ascending");
  });
});

describe("facet options", () => {
  it("offers only values the contract accepts", () => {
    for (const facet of FACET_SELECTS) {
      for (const option of facet.options) {
        if (option.value === ALL) continue;
        const value = facet.key === "soloAdmin" ? soloAdminFromSelect(option.value) : option.value;
        const parsed = adminUserFilterSchema.safeParse({ [facet.key]: value });
        expect(parsed.success, `${facet.key}=${option.value}`).toBe(true);
      }
    }
  });

  it("names every order the base whitelists", () => {
    expect(Object.keys(ORDEN_LABELS).sort()).toEqual([...ADMIN_ORDERS].sort());
  });

  it("reads the MBTI list as valid codes", () => {
    for (const code of MBTI_CODES) {
      expect(adminUserFilterSchema.safeParse({ mbti: code }).success, code).toBe(true);
    }
  });
});

describe("select translation", () => {
  it("reads the admin-only facet off the select", () => {
    expect(soloAdminFromSelect("si")).toBe(true);
    expect(soloAdminFromSelect(ALL)).toBeUndefined();
  });

  it("writes every facet kind back as a select value", () => {
    expect(selectValue(undefined)).toBe(ALL);
    expect(selectValue(true)).toBe("si");
    expect(selectValue("romance")).toBe("romance");
  });
});

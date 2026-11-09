/**
 * The URL of the console, read as the contract allows. A query string is the
 * only place where a person typing in the address bar reaches the listing, so
 * every facet here is matched against the words of its own enum: anything
 * else is absent, never searched, never sent to the base.
 */
import { describe, expect, it } from "vitest";

import { ADMIN_CONFIG } from "@/config";

import { daysParam, pageParam, userFilterParam } from "./admin-route.server";

const at = (query: string) => new Request(`http://localhost/api/admin/users?${query}`);

describe("userFilterParam", () => {
  it("reads the facets it knows and leaves out the ones nobody chose", () => {
    expect(userFilterParam(at("q=ajolote&page=2"))).toEqual({});
    expect(
      userFilterParam(at("estado=eclosionado&pausado=no&sinAfinidad=romance&mbti=intj&orden=nombre&desde=2026-11-01&hasta=2026-11-08")),
    ).toEqual({
      estado: "eclosionado",
      pausado: "no",
      sinAfinidad: "romance",
      mbti: "intj",
      orden: "nombre",
      desde: "2026-11-01",
      hasta: "2026-11-08",
    });
    // The flag is the word the console writes, and its absence is no key at all.
    expect(userFilterParam(at("soloAdmin=si"))).toEqual({ soloAdmin: true });
    expect(userFilterParam(at("soloAdmin=1"))).toEqual({});
  });

  it("drops a value outside the whitelist instead of forwarding it", () => {
    for (const hostile of [
      "estado=%27%3B%20DROP%20TABLE%20profiles%3B--",
      "mbti=INT%27%20OR%201%3D1--",
      "orden=nombre%3B%20DELETE%20FROM%20matches",
      "desde=ayer",
      "sinAfinidad=trabajo",
      "pausado=tal%20vez",
    ]) {
      expect(userFilterParam(at(hostile)), hostile).toEqual({});
    }
    // All or nothing: a URL asking for one impossible facet is not trusted
    // with the half of itself that looked well formed, so nothing is filtered.
    expect(userFilterParam(at("orden=antiguas&mbti=%27%20OR%201%3D1"))).toEqual({});
  });

  it("leaves the calendar to the base, which is where it is refused", () => {
    // `AAAA-MM-DD` is all a link can promise here; `2026-02-30` has that shape
    // and no other layer knows whether the day exists. `admin_iso_date` turns
    // it into "no filter" instead of letting the cast break the whole read.
    expect(userFilterParam(at("desde=2026-02-30"))).toEqual({ desde: "2026-02-30" });
  });

  it("never carries a parameter the contract does not declare", () => {
    expect(userFilterParam(at("matricula=900000001&pin=1234&theta=0.5&limit=100000&estado=huevo"))).toEqual({ estado: "huevo" });
  });
});

describe("daysParam", () => {
  it("passes an integer through and refuses anything that is not one", () => {
    const url = (query: string) => new Request(`http://localhost/api/admin/metrics?${query}`);
    expect(daysParam(url("days=7"))).toBe(7);
    expect(daysParam(url("days=0"))).toBe(0);
    expect(daysParam(url("days=-30"))).toBe(-30);
    expect(daysParam(url("days=90.5"))).toBeNull();
    expect(daysParam(url("days=ayer"))).toBeNull();
    expect(daysParam(url("days="))).toBeNull();
    expect(daysParam(url("q=1"))).toBeNull();
  });

  it("keeps the windows the console offers reachable", () => {
    for (const days of ADMIN_CONFIG.metrics.windowsDays) {
      expect(daysParam(new Request(`http://localhost/api/admin/metrics?days=${days}`))).toBe(days);
    }
  });
});

describe("pageParam", () => {
  it("starts at zero for anything that is not a page", () => {
    const url = (query: string) => new Request(`http://localhost/api/admin/users?${query}`);
    expect(pageParam(url("page=3"))).toBe(3);
    for (const query of ["page=-1", "page=NaN", "page=hola", ""]) expect(pageParam(url(query)), query).toBe(0);
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  raceTiming,
  zonedTime,
  countdownText,
  archivedRace,
  formatRaceDate,
} from "../src/lib/races.mjs";
import {
  normalizeFrame,
  frameStyle,
  frameForImage,
} from "../src/lib/images.mjs";
import { validateCms } from "../scripts/validate-cms.mjs";
const now = Date.parse("2026-11-06T10:00:00Z");

test("race countdown uses Sofia time, never invents an unknown start time", () => {
  const race = {
    date: "2026-11-07",
    startTime: "09:00",
    timeZone: "Europe/Sofia",
    status: "confirmed",
  };
  assert.equal(raceTiming(race).startMs, Date.parse("2026-11-07T07:00:00Z"));
  assert.match(countdownText(race, now), /21 ч/);
  assert.equal(
    countdownText({ ...race, startTime: "" }, now),
    "Остават 1 ден · часът предстои",
  );
  assert.equal(
    countdownText({ date: "2026-11-06" }, now),
    "Днес · часът предстои",
  );
});
test("invalid dates, time zones and ambiguous/nonexistent daylight-saving times have no fake countdown", () => {
  for (const date of ["", "not-a-date", "2026-02-30"])
    assert.equal(countdownText({ date }, now), "");
  assert.equal(
    countdownText({ date: "2026-11-07", timeZone: "Invalid/Zone" }, now),
    "",
  );
  assert.equal(zonedTime("2026-03-29", "03:30"), undefined);
  assert.equal(zonedTime("2026-10-25", "03:30"), undefined);
  assert.equal(zonedTime("2026-11-07", "25:00"), undefined);
  assert.equal(formatRaceDate({ date: "" }), "Датата предстои");
});
test("past/completed/cancelled races are archived and have no countdown", () => {
  for (const race of [
    { date: "2026-11-05" },
    { date: "2026-11-07", status: "cancelled" },
    { date: "2026-11-07", status: "completed" },
  ]) {
    assert.equal(archivedRace(race, now), true);
    assert.equal(countdownText(race, now), "");
  }
  assert.equal(
    archivedRace({ date: "2026-11-07", status: "planned" }, now),
    false,
  );
});
test("image defaults show the whole image; crop values are bounded and CSS cannot be injected", () => {
  assert.deepEqual(normalizeFrame(undefined), {
    fit: "contain",
    x: 50,
    y: 35,
    mobileFit: "contain",
    mobileX: 50,
    mobileY: 35,
  });
  assert.equal(
    normalizeFrame({
      fit: "cover",
      x: 110,
      y: -5,
      mobileFit: "contain",
      mobileX: 12,
    }).x,
    100,
  );
  assert.equal(normalizeFrame({ y: -5 }).y, 0);
  assert.ok(
    !frameStyle({
      fit: "cover;background:url(secret)",
      x: "20;display:none",
    }).includes("secret"),
  );
  assert.equal(
    frameForImage(
      "/images/a.jpg",
      [{ image: "/images/a.jpg", frame: { fit: "cover" } }],
      {},
    ).fit,
    "cover",
  );
});
test("CMS has real file uploads, non-public build source storage and unchanged legacy editor capabilities", () => {
  const config = validateCms(readFileSync(".pages.yml", "utf8"));
  const posts = config.content.find((item) => item.name === "posts");
  const body = posts.fields.find((field) => field.name === "body");
  assert.deepEqual(body.options, {
    media: "images",
    format: "markdown",
    switcher: true,
  });
  assert.equal(
    posts.fields.find((field) => field.name === "gallery").options.multiple.max,
    10,
  );
  const route = config.content.find((item) => item.name === "routes");
  assert.equal(route.fields.find((field) => field.name === "gpx").type, "file");
  for (const field of ["publicApproved", "publishMap", "allowDownload"])
    assert.equal(
      route.fields.find((item) => item.name === field).default,
      false,
    );
  assert.equal(
    route.fields.find((item) => item.name === "status").default,
    "draft",
  );
  assert.ok(
    config.components.imageFrame.fields.some(
      (field) => field.name === "mobileY",
    ),
  );
  assert.equal(
    config.content
      .find((item) => item.name === "races")
      .fields.find((item) => item.name === "date").default,
    "",
  );
  assert.throws(() =>
    validateCms(
      readFileSync(".pages.yml", "utf8").replace(
        "input: src/data/gpx",
        "input: public/gpx",
      ),
    ),
  );
  assert.throws(() => validateCms("media: []\nmedia: []\ncontent: []"));
});

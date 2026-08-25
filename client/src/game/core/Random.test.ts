import { describe, expect, it } from "vitest";
import { Random } from "./Random";

describe("Random", () => {
  it("replays the same sequence from the same seed", () => {
    const first = new Random(12345);
    const second = new Random(12345);
    expect(Array.from({ length: 8 }, () => first.next())).toEqual(
      Array.from({ length: 8 }, () => second.next())
    );
  });

  it("does not mutate the source array when shuffling", () => {
    const source = ["A", "B", "C", "D"];
    const shuffled = new Random(7).shuffle(source);
    expect(source).toEqual(["A", "B", "C", "D"]);
    expect([...shuffled].sort()).toEqual([...source].sort());
  });
});

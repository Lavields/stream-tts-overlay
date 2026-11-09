import test from "node:test";
import assert from "node:assert/strict";
import { voiceVolume, playbackGain } from "../public/voice-volume.js";
test("el nivel original es 100% y cada motor y voz conserva su ajuste propio", () => {
  const volumes = {"offline:demo":60,"fish:demo":130,"system:default":0};
  assert.equal(voiceVolume(volumes,"offline:demo"),60);
  assert.equal(voiceVolume(volumes,"fish:demo"),130);
  assert.equal(voiceVolume(volumes,"offline:otra"),100);
  assert.equal(playbackGain(80,volumes,"offline:demo"),.48);
  assert.equal(playbackGain(80,volumes,"system:default"),0);
  assert.equal(playbackGain(0,volumes,"fish:demo"),0);
  assert.equal(playbackGain(80,{},"offline:otra"),.8);
});
test("rechaza valores inválidos y limita el ajuste manual", () => {
  assert.equal(voiceVolume({a:NaN},"a"),100);
  assert.equal(voiceVolume({a:Infinity},"a"),100);
  assert.equal(voiceVolume({a:-20},"a"),0);
  assert.equal(voiceVolume({a:300},"a"),200);
});

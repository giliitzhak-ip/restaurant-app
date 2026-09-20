/**
 * The STANGA touch rule: one touch per turn, juggling excepted.
 *
 * These are the rules of the game now, in every mode, so they are asserted
 * directly rather than through the engine.
 */
import { describe, expect, it } from 'vitest';
import { TouchRuleEngine, createTouchRuleState } from '../src/game/TouchRuleEngine';

function touch(
  rule: TouchRuleEngine,
  playerId: string,
  tick: number,
  patch: { deliberate?: boolean; relativeSpeed?: number } = {},
) {
  return rule.register({
    playerId,
    team: playerId.startsWith('home') ? 'home' : 'away',
    tick,
    deliberate: patch.deliberate ?? true,
    relativeSpeed: patch.relativeSpeed ?? 6,
  });
}

describe('touch rule', () => {
  it('starts with nobody owning the turn', () => {
    const state = createTouchRuleState();
    expect(state.lastMeaningfulTouchPlayerId).toBeNull();
    expect(state.ballHasTouchedGroundSinceFirstTouch).toBe(true);
  });

  it('a first touch takes the turn', () => {
    const rule = new TouchRuleEngine();
    expect(touch(rule, 'home-1', 10)).toBe('firstTouch');
    expect(rule.state.lastMeaningfulTouchPlayerId).toBe('home-1');
    expect(rule.state.lastMeaningfulTouchTeamId).toBe('home');
    expect(rule.state.touchSequenceId).toBe(1);
    expect(rule.state.firstTouchTick).toBe(10);
    expect(rule.canTouch('home-1')).toBe(true);
  });

  it('a second touch after the ball lands is a violation', () => {
    const rule = new TouchRuleEngine();
    touch(rule, 'home-1', 10);
    rule.registerGroundContact(20);

    expect(rule.canTouch('home-1')).toBe(false);
    expect(touch(rule, 'home-1', 25)).toBe('violation');
  });

  it('keeps juggling legal while the ball stays up', () => {
    const rule = new TouchRuleEngine();
    expect(touch(rule, 'home-1', 10)).toBe('firstTouch');
    expect(touch(rule, 'home-1', 20)).toBe('juggle');
    expect(touch(rule, 'home-1', 30)).toBe('juggle');
    expect(rule.state.aerialTouchCount).toBe(3);
    expect(rule.state.aerialChainActive).toBe(true);

    rule.registerGroundContact(40);

    expect(rule.state.aerialChainActive).toBe(false);
    expect(touch(rule, 'home-1', 45)).toBe('violation');
  });

  it('a wall, a post or the bar does not end a juggle', () => {
    const rule = new TouchRuleEngine();
    touch(rule, 'home-1', 10);
    // Nothing is reported to the rule: only the playing surface is ground.
    expect(touch(rule, 'home-1', 20)).toBe('juggle');
    expect(rule.state.ballHasTouchedGroundSinceFirstTouch).toBe(false);
  });

  it('a team-mate touching the ball hands the turn back', () => {
    const rule = new TouchRuleEngine();
    touch(rule, 'home-1', 10);
    rule.registerGroundContact(20);
    expect(touch(rule, 'home-2', 25)).toBe('firstTouch');

    // The pass reset the passer, so a one-two is legal.
    rule.registerGroundContact(30);
    expect(rule.canTouch('home-1')).toBe(true);
    expect(touch(rule, 'home-1', 35)).toBe('firstTouch');
  });

  it('an opponent touching the ball hands the turn back too', () => {
    const rule = new TouchRuleEngine();
    touch(rule, 'home-1', 10);
    rule.registerGroundContact(20);
    expect(touch(rule, 'away-1', 25)).toBe('firstTouch');
    expect(rule.canTouch('home-1')).toBe(true);
  });

  it('ignores a graze but never a deliberate play', () => {
    const rule = new TouchRuleEngine();
    expect(touch(rule, 'home-1', 5, { deliberate: false, relativeSpeed: 0.2 })).toBe('ignored');
    expect(rule.state.lastMeaningfulTouchPlayerId).toBeNull();

    expect(touch(rule, 'home-1', 6, { deliberate: true, relativeSpeed: 0.01 })).toBe('firstTouch');
  });

  it('counts a firm accidental contact as a touch', () => {
    const rule = new TouchRuleEngine();
    expect(touch(rule, 'home-1', 5, { deliberate: false, relativeSpeed: 8 })).toBe('firstTouch');
  });

  it('whistles a scramble once, not once per frame', () => {
    const rule = new TouchRuleEngine();
    touch(rule, 'home-1', 10);
    rule.registerGroundContact(20);

    expect(touch(rule, 'home-1', 21)).toBe('violation');
    expect(touch(rule, 'home-1', 22)).toBe('ignored');
    expect(touch(rule, 'home-1', 23)).toBe('ignored');

    for (let tick = 24; tick < 60; tick += 1) rule.advance();
    expect(touch(rule, 'home-1', 60)).toBe('violation');
  });

  it('a restart gives the ball back to everybody', () => {
    const rule = new TouchRuleEngine();
    touch(rule, 'home-1', 10);
    rule.registerGroundContact(20);
    expect(rule.canTouch('home-1')).toBe(false);

    rule.reset(30);

    expect(rule.canTouch('home-1')).toBe(true);
    expect(rule.state.lastMeaningfulTouchPlayerId).toBeNull();
    expect(rule.state.aerialChainActive).toBe(false);
  });

  it('reports the juggle count only while a chain is alive', () => {
    const rule = new TouchRuleEngine();
    touch(rule, 'home-1', 10);
    touch(rule, 'home-1', 12);
    expect(rule.aerialCount).toBe(2);
    rule.registerGroundContact(14);
    expect(rule.aerialCount).toBe(0);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { createEventEmitter, type EventType } from '@/lib/events.js';

// Helper to wait for async event emission (setImmediate)
const waitForEvents = () => new Promise((resolve) => setImmediate(resolve));

describe('events.ts', () => {
  describe('createEventEmitter', () => {
    it('should emit events to single subscriber', async () => {
      const emitter = createEventEmitter();
      const callback = vi.fn();

      emitter.subscribe(callback);
      emitter.emit('agent:stream', { message: 'test' });

      await waitForEvents();

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith('agent:stream', { message: 'test' });
    });

    it('should emit events to multiple subscribers', async () => {
      const emitter = createEventEmitter();
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      emitter.subscribe(callback1);
      emitter.subscribe(callback2);
      emitter.subscribe(callback3);
      emitter.emit('feature:started', { id: '123' });

      await waitForEvents();

      expect(callback1).toHaveBeenCalledOnce();
      expect(callback2).toHaveBeenCalledOnce();
      expect(callback3).toHaveBeenCalledOnce();
      expect(callback1).toHaveBeenCalledWith('feature:started', { id: '123' });
    });

    it('should support unsubscribe functionality', async () => {
      const emitter = createEventEmitter();
      const callback = vi.fn();

      const unsubscribe = emitter.subscribe(callback);
      emitter.emit('agent:stream', { test: 1 });

      await waitForEvents();

      expect(callback).toHaveBeenCalledOnce();

      unsubscribe();
      emitter.emit('agent:stream', { test: 2 });

      await waitForEvents();

      expect(callback).toHaveBeenCalledOnce(); // Still called only once
    });

    it('should handle errors in subscribers without crashing', async () => {
      const emitter = createEventEmitter();
      const errorCallback = vi.fn(() => {
        throw new Error('Subscriber error');
      });
      const normalCallback = vi.fn();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      emitter.subscribe(errorCallback);
      emitter.subscribe(normalCallback);

      expect(() => {
        emitter.emit('feature:error', { error: 'test' });
      }).not.toThrow();

      await waitForEvents();

      expect(errorCallback).toHaveBeenCalledOnce();
      expect(normalCallback).toHaveBeenCalledOnce();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should emit different event types', async () => {
      const emitter = createEventEmitter();
      const callback = vi.fn();

      emitter.subscribe(callback);

      const eventTypes: EventType[] = [
        'agent:stream',
        'auto-mode:started',
        'feature:completed',
        'project:analysis-progress',
      ];

      eventTypes.forEach((type) => {
        emitter.emit(type, { type });
      });

      await waitForEvents();

      expect(callback).toHaveBeenCalledTimes(4);
    });

    it('should handle emitting without subscribers', () => {
      const emitter = createEventEmitter();

      expect(() => {
        emitter.emit('agent:stream', { test: true });
      }).not.toThrow();
    });

    it('should allow multiple subscriptions and unsubscriptions', async () => {
      const emitter = createEventEmitter();
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      const unsub1 = emitter.subscribe(callback1);
      const unsub2 = emitter.subscribe(callback2);
      const unsub3 = emitter.subscribe(callback3);

      emitter.emit('feature:started', { test: 1 });
      await waitForEvents();

      expect(callback1).toHaveBeenCalledOnce();
      expect(callback2).toHaveBeenCalledOnce();
      expect(callback3).toHaveBeenCalledOnce();

      unsub2();

      emitter.emit('feature:started', { test: 2 });
      await waitForEvents();

      expect(callback1).toHaveBeenCalledTimes(2);
      expect(callback2).toHaveBeenCalledOnce(); // Still just once
      expect(callback3).toHaveBeenCalledTimes(2);

      unsub1();
      unsub3();

      emitter.emit('feature:started', { test: 3 });
      await waitForEvents();

      expect(callback1).toHaveBeenCalledTimes(2);
      expect(callback2).toHaveBeenCalledOnce();
      expect(callback3).toHaveBeenCalledTimes(2);
    });
  });
});

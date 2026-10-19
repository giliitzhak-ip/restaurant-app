/** Growable Float32 buffer for collecting decoded samples without repeated reallocation. */
export class FloatBuffer {
  private data: Float32Array;
  private length = 0;

  constructor(initialCapacity = 1 << 20) {
    this.data = new Float32Array(initialCapacity);
  }

  pushInt16(samples: Int16Array) {
    if (this.length + samples.length > this.data.length) {
      let capacity = this.data.length * 2;
      while (capacity < this.length + samples.length) capacity *= 2;
      const next = new Float32Array(capacity);
      next.set(this.data.subarray(0, this.length));
      this.data = next;
    }
    for (let i = 0; i < samples.length; i++) this.data[this.length + i] = samples[i]! / 32768;
    this.length += samples.length;
  }

  view(): Float32Array {
    return this.data.subarray(0, this.length);
  }
}

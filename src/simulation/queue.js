/** FIFO lane queue with an advancing head pointer (amortized O(1) enqueue/dequeue). */
export class LaneQueue {
  constructor() { this.items = []; this.head = 0; }
  enqueue(vehicle) { this.items.push(vehicle); }
  dequeue() {
    if (this.isEmpty()) throw new RangeError('dequeue from empty lane');
    const vehicle = this.items[this.head];
    this.items[this.head] = null;
    this.head += 1;
    if (this.head >= 64 && this.head * 2 >= this.items.length) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }
    return vehicle;
  }
  front() { return this.isEmpty() ? undefined : this.items[this.head]; }
  rear() { return this.isEmpty() ? undefined : this.items[this.items.length - 1]; }
  forEach(visitor) { for (let index = this.head; index < this.items.length; index += 1) visitor(this.items[index]); }
  isEmpty() { return this.head >= this.items.length; }
  get size() { return this.items.length - this.head; }
  values() { return this.items.slice(this.head); }
}

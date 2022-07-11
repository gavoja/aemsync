export default class Channel {
  constructor (abortSignal) {
    this.messageQueue = []
    this.promiseQueue = []

    abortSignal && abortSignal.onabort(() => {
      const nextPromise = this.promiseQueue.shift()
      nextPromise && nextPromise.resolve()
    })
  }

  put (msg) {
    // Anyone waiting for a message?
    if (this.promiseQueue.length) {
      // Deliver the message to the oldest one waiting (FIFO).
      const nextPromise = this.promiseQueue.shift()
      nextPromise.resolve(msg)
    } else {
      // No one is waiting - queue the event.
      this.messageQueue.push(msg)
    }
  }

  take () {
    // Do we have queued messages?
    if (this.messageQueue.length) {
      // Deliver the oldest queued message.
      return Promise.resolve(this.messageQueue.shift())
    } else {
      // No queued messages - queue the taker until a message arrives.
      return new Promise((resolve, reject) => this.promiseQueue.push({ resolve, reject }))
    }
  }
}

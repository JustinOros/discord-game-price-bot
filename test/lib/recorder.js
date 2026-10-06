class Recorder {
  constructor() {
    this.steps = [];
    this.current = null;
    this.onBegin = null;
    this.begin("load");
  }

  begin(label) {
    this.current = { label: label };
    this.steps.push(this.current);
    if (this.onBegin) this.onBegin(this.steps.length - 1);
  }

  push(category, entry) {
    if (!this.current[category]) this.current[category] = [];
    this.current[category].push(entry);
  }
}

module.exports = { Recorder };

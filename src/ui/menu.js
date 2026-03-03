export class Menu {
  constructor() {
    this.el = document.getElementById('menu');
  }

  show() {
    if (this.el) this.el.classList.remove('hidden');
  }

  hide() {
    if (this.el) this.el.classList.add('hidden');
  }
}

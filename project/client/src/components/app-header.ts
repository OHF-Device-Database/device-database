import { LitElement, html, unsafeCSS } from "lit"
import { customElement } from "lit/decorators.js"
import globalStyles from "../index.css?inline"

@customElement("app-header")
export class AppHeader extends LitElement {
  static styles = [unsafeCSS(globalStyles)]

  render() {
    return html`
      <header class="navbar bg-gray-200 border-b border-gray-300">
        <div class="container mx-10">
          <div class="navbar-start">
            <img src="/open-home-foundation.svg" alt="Open Home Foundation" class="h-10">
          </div>
        </div>
      </header>
    `
  }
}

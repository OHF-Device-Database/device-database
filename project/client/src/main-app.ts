import { LitElement, html, unsafeCSS } from "lit"
import { customElement } from "lit/decorators.js"
import "./components/app-header.ts"
import "./components/example-form.ts"
import globalStyles from "./index.css?inline"

@customElement("main-app")
export class MainApp extends LitElement {
  static styles = [unsafeCSS(globalStyles)]

  render() {
    return html`
      <div class="min-h-screen bg-base-100">
        <app-header></app-header>
        
        <main class="container mx-auto px-4 py-8">
          <example-form></example-form>
        </main>
      </div>
    `
  }
}
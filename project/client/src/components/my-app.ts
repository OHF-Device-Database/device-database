import { LitElement, css, html } from 'lit'
import { customElement } from 'lit/decorators.js'
import './app-header.ts'
import './form-example.ts'

@customElement('my-app')
export class MyApp extends LitElement {
  static styles = css`
    main {
      padding: 20px;
    }
  `;

  render() {
    return html`
      <div>
        <app-header></app-header>

        <main class="main">
          <form-example></form-example>
        </main>
      </div>
    `
  }
}

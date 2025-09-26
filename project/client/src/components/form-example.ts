import '@awesome.me/webawesome/dist/components/button/button.js'
import '@awesome.me/webawesome/dist/components/input/input.js'
import { TanStackFormController } from '@tanstack/lit-form'
import { LitElement, html, nothing } from 'lit'
import { customElement } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'

@customElement('form-example')
export class FormExample extends LitElement {
  #form = new TanStackFormController(this, {
    defaultValues: {
      firstName: '',
      lastName: '',
    },
    onSubmit({ value }) {
      console.log(value)
    },
  });

  _handleSubmit = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    this.#form.api.handleSubmit()
  }

  render() {
    return html`
      <form
        @submit=${this._handleSubmit}
      class="wa-stack wa-gap-2xl"
      >
          ${this.#form.field(
      {
        name: `firstName`,
        validators: {
          onChange: ({ value }) =>
            !value
              ? 'A first name is required'
              : value.length < 3
                ? 'First name must be at least 3 characters'
                : undefined,
          onChangeAsyncDebounceMs: 500,
          onChangeAsync: async ({ value }) => {
            await new Promise(resolve => setTimeout(resolve, 1000))
            return (
              value.includes('error') &&
              'No "error" allowed in first name'
            )
          },
        },
      },
      field => {
        return html` <div>
                <wa-input
                  label="First Name"
                  id="${field.name}"
                  name="${field.name}"
                  .value="${field.state.value}"
                  @blur="${() => field.handleBlur()}"
                  @input="${(e: Event) => {
            const target = e.target as HTMLInputElement
            field.handleChange(target.value)
          }}"
                ></wa-input>
                ${field.state.meta.isTouched && !field.state.meta.isValid
            ? html`${repeat(
              field.state.meta.errors,
              (__, idx) => idx,
              error => {
                return html`<div style="color: red;">${error}</div>`
              }
            )}`
            : nothing}
                ${field.state.meta.isValidating
            ? html`<p>Validating...</p>`
            : nothing}
              </div>`
      }
    )}
        </div>
        <div>
          ${this.#form.field(
      {
        name: `lastName`,
      },
      field => {
        return html` <div>
                <wa-input
                  label="Last Name"
                  id="${field.name}"
                  name="${field.name}"
                  .value="${field.state.value}"
                  @blur="${() => field.handleBlur()}"
                  @input="${(e: Event) => {
            const target = e.target as HTMLInputElement
            field.handleChange(target.value)
          }}"
                ></wa-input>
              </div>`
      }
    )}
        </div>

        <wa-button type="submit" variant="brand" size="medium" .disabled=${this.#form.api.state.isSubmitting}>
          ${this.#form.api.state.isSubmitting ? '...' : 'Submit'}
        </wa-button>
        <wa-button
          type="button"
          @click=${() => {
        this.#form.api.reset()
      }}
        >
          Reset
        </wa-button>
      </form>
    `
  }
}

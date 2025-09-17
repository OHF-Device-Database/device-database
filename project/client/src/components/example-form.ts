import { TanStackFormController } from "@tanstack/lit-form"
import { html, LitElement, nothing, unsafeCSS } from "lit"
import { customElement } from "lit/decorators.js"
import { repeat } from "lit/directives/repeat.js"
import globalStyles from "../index.css?inline"

@customElement("example-form")
export class ExampleForm extends LitElement {
    static styles = [unsafeCSS(globalStyles)]

    #form = new TanStackFormController(this, {
        defaultValues: {
            firstName: '',
            lastName: '',
        },
        onSubmit({ value }) {
            // Do something with form data
            console.log(value)
        },
    })

    render() {
        return html`
          <form
            @submit=${(e: Event) => {
                e.preventDefault()
                e.stopPropagation()
                this.#form.api.handleSubmit()
            }}
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
                            await new Promise((resolve) => setTimeout(resolve, 1000))
                            return (
                                value.includes('error') &&
                                'No "error" allowed in first name'
                            )
                        },
                    },
                },
                (field) => {
                    return html` <fieldset class="fieldset">
                    <legend class="fieldset-legend">First Name</legend>
                    <input
                      id="${field.name}"
                      name="${field.name}"
                      type="text"
                      class="input"
                      .value="${field.state.value}"
                      @blur="${() => field.handleBlur()}"
                      @input="${(e: Event) => {
                            const target = e.target as HTMLInputElement
                            field.handleChange(target.value)
                        }}"
                    />
                    ${field.state.meta.isTouched && !field.state.meta.isValid
                            ? html`${repeat(
                                field.state.meta.errors,
                                (__, idx) => idx,
                                (error) => {
                                    return html`<div style="color: red;">${error}</div>`
                                },
                            )}`
                            : nothing}
                    ${field.state.meta.isValidating
                            ? html`<p>Validating...</p>`
                            : nothing}
                  </fieldset>`
                },
            )}
            </div>
            <div>
              ${this.#form.field(
                {
                    name: `lastName`,
                },
                (field) => {
                    return html` <fieldset class="fieldset">
                    <legend class="fieldset-legend">Last Name</legend>
                    <input
                      id="${field.name}"
                      name="${field.name}"
                      type="text"
                      class="input"
                      .value="${field.state.value}"
                      @blur="${() => field.handleBlur()}"
                      @input="${(e: Event) => {
                            const target = e.target as HTMLInputElement
                            field.handleChange(target.value)
                        }}"
                    />
                  </fieldset>`
                },
            )}
            </div>
    
            <button type="submit" ?disabled=${this.#form.api.state.isSubmitting} class="btn btn-primary btn-sm mt-6">
              ${this.#form.api.state.isSubmitting ? '...' : 'Submit'}
            </button>
            <button
              class="btn btn-secondary btn-sm mt-6"
              type="button"
              @click=${() => {
                this.#form.api.reset()
            }}
            >
              Reset
            </button>
          </form>
        `
    }
}

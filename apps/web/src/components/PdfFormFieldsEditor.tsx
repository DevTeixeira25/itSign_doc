"use client";

export interface PdfFormFieldDefinition {
  name: string;
  label: string;
  type: "text" | "checkbox" | "dropdown" | "option_list" | "radio" | "signature" | "unknown";
  readOnly: boolean;
  required: boolean;
  options?: string[];
  value?: string | boolean | string[];
}

interface Props {
  fields: PdfFormFieldDefinition[];
  values: Record<string, string | boolean | string[]>;
  onChange: (values: Record<string, string | boolean | string[]>) => void;
}

export default function PdfFormFieldsEditor({ fields, values, onChange }: Props) {
  function update(name: string, value: string | boolean | string[]) {
    onChange({ ...values, [name]: value });
  }

  return (
    <div className="card">
      <h2>Preenchimento do documento</h2>
      <p className="text-sm text-muted">
        Campos preenchíveis detectados automaticamente no PDF.
      </p>

      <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
        {fields.map((field) => {
          const currentValue = values[field.name] ?? field.value;

          if (field.type === "checkbox") {
            return (
              <label key={field.name} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={currentValue === true}
                  disabled={field.readOnly}
                  onChange={(e) => update(field.name, e.target.checked)}
                />
                <span>{field.label}</span>
              </label>
            );
          }

          if ((field.type === "dropdown" || field.type === "radio") && field.options?.length) {
            return (
              <div className="form-group" key={field.name}>
                <label>{field.required ? `${field.label} *` : field.label}</label>
                <select
                  value={typeof currentValue === "string" ? currentValue : ""}
                  disabled={field.readOnly}
                  onChange={(e) => update(field.name, e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            );
          }

          if (field.type === "option_list" && field.options?.length) {
            const selected = new Set(Array.isArray(currentValue) ? currentValue : []);
            return (
              <div className="form-group" key={field.name}>
                <label>{field.required ? `${field.label} *` : field.label}</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {field.options.map((option) => (
                    <label
                      key={option}
                      style={{
                        display: "inline-flex",
                        gap: 6,
                        alignItems: "center",
                        padding: "8px 10px",
                        border: "1px solid var(--gray-200)",
                        borderRadius: 999,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(option)}
                        disabled={field.readOnly}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(option);
                          else next.delete(option);
                          update(field.name, Array.from(next));
                        }}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          }

          return (
            <div className="form-group" key={field.name}>
              <label>{field.required ? `${field.label} *` : field.label}</label>
              <input
                value={Array.isArray(currentValue) ? currentValue.join(", ") : typeof currentValue === "string" ? currentValue : ""}
                disabled={field.readOnly}
                placeholder={field.type === "signature" ? "Campo de assinatura detectado no PDF" : ""}
                onChange={(e) => update(field.name, e.target.value)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

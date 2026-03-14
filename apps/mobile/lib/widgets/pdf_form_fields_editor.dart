import "package:flutter/material.dart";

class PdfFormFieldDefinition {
  final String name;
  final String label;
  final String type;
  final bool readOnly;
  final bool required;
  final List<String> options;
  final Object? value;

  const PdfFormFieldDefinition({
    required this.name,
    required this.label,
    required this.type,
    required this.readOnly,
    required this.required,
    required this.options,
    required this.value,
  });

  factory PdfFormFieldDefinition.fromJson(Map<String, dynamic> json) {
    return PdfFormFieldDefinition(
      name: json["name"]?.toString() ?? "",
      label: json["label"]?.toString() ?? json["name"]?.toString() ?? "Campo",
      type: json["type"]?.toString() ?? "text",
      readOnly: json["readOnly"] == true,
      required: json["required"] == true,
      options: (json["options"] as List<dynamic>? ?? const <dynamic>[]).map((item) => item.toString()).toList(),
      value: _normalizeValue(json["value"]),
    );
  }

  static Object? _normalizeValue(Object? raw) {
    if (raw is List) {
      return raw.map((item) => item.toString()).toList();
    }
    if (raw is String || raw is bool) return raw;
    return raw?.toString();
  }
}

class PdfFormFieldsEditor extends StatelessWidget {
  final List<PdfFormFieldDefinition> fields;
  final Map<String, Object> values;
  final ValueChanged<Map<String, Object>> onChanged;

  const PdfFormFieldsEditor({
    super.key,
    required this.fields,
    required this.values,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          "Campos detectados automaticamente no PDF",
          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 6),
        Text(
          "Se o arquivo tiver campos preenchíveis, eles aparecem aqui para você completar antes de assinar.",
          style: TextStyle(color: theme.colorScheme.onSurfaceVariant),
        ),
        const SizedBox(height: 16),
        for (final field in fields) ...[
          _buildField(context, field),
          const SizedBox(height: 14),
        ],
      ],
    );
  }

  Widget _buildField(BuildContext context, PdfFormFieldDefinition field) {
    final currentValue = values.containsKey(field.name) ? values[field.name] : field.value;

    if (field.type == "checkbox") {
      return CheckboxListTile(
        value: currentValue == true,
        onChanged: field.readOnly ? null : (value) => _update(field.name, value ?? false),
        title: Text(field.label),
        subtitle: field.readOnly ? const Text("Campo somente leitura") : null,
        controlAffinity: ListTileControlAffinity.leading,
        contentPadding: EdgeInsets.zero,
      );
    }

    if ((field.type == "dropdown" || field.type == "radio") && field.options.isNotEmpty) {
      return DropdownButtonFormField<String>(
        initialValue: currentValue is String && currentValue.isNotEmpty ? currentValue : null,
        items: field.options
            .map((option) => DropdownMenuItem<String>(value: option, child: Text(option)))
            .toList(),
        onChanged: field.readOnly ? null : (value) => _update(field.name, value ?? ""),
        decoration: InputDecoration(
          labelText: field.label,
          border: const OutlineInputBorder(),
          helperText: field.readOnly ? "Campo somente leitura" : null,
        ),
      );
    }

    if (field.type == "option_list" && field.options.isNotEmpty) {
      final selected = (currentValue is List ? currentValue : const <String>[])
          .map((item) => item.toString())
          .toSet();
      return InputDecorator(
        decoration: InputDecoration(
          labelText: field.label,
          border: const OutlineInputBorder(),
          helperText: field.readOnly ? "Campo somente leitura" : null,
        ),
        child: Wrap(
          spacing: 8,
          runSpacing: 8,
          children: field.options.map((option) {
            final isSelected = selected.contains(option);
            return FilterChip(
              label: Text(option),
              selected: isSelected,
              onSelected: field.readOnly
                  ? null
                  : (enabled) {
                      final next = {...selected};
                      if (enabled) {
                        next.add(option);
                      } else {
                        next.remove(option);
                      }
                      _update(field.name, next.toList());
                    },
            );
          }).toList(),
        ),
      );
    }

    final textValue = currentValue is List
        ? currentValue.join(", ")
        : currentValue == null
            ? ""
            : currentValue.toString();

    return TextFormField(
      initialValue: textValue,
      readOnly: field.readOnly,
      onChanged: (value) => _update(field.name, value),
      decoration: InputDecoration(
        labelText: field.required ? "${field.label} *" : field.label,
        border: const OutlineInputBorder(),
        helperText: field.type == "signature"
            ? "Campo de assinatura detectado no PDF. Você pode complementar com texto se quiser."
            : field.readOnly
                ? "Campo somente leitura"
                : null,
      ),
      minLines: field.type == "text" ? 1 : null,
      maxLines: field.type == "text" ? 1 : null,
    );
  }

  void _update(String name, Object value) {
    final next = Map<String, Object>.from(values);
    next[name] = value;
    onChanged(next);
  }
}

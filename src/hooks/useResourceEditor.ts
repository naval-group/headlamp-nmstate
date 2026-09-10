import { useCallback } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KubeResourceBuilder = Record<string, any>;

export default function useResourceEditor(
  resource: KubeResourceBuilder,
  onChange: (resource: KubeResourceBuilder) => void
) {
  const updateMetadata = useCallback(
    (field: string, value: unknown) => {
      onChange({
        ...resource,
        metadata: { ...resource.metadata, [field]: value },
      });
    },
    [resource, onChange]
  );

  const updateSpec = useCallback(
    (updates: KubeResourceBuilder) => {
      onChange({
        ...resource,
        spec: { ...resource.spec, ...updates },
      });
    },
    [resource, onChange]
  );

  const updateNestedPath = useCallback(
    (path: string[], value: unknown) => {
      const result = { ...resource };
      let current = result;
      for (let i = 0; i < path.length - 1; i++) {
        current[path[i]] = { ...current[path[i]] };
        current = current[path[i]];
      }
      current[path[path.length - 1]] = value;
      onChange(result);
    },
    [resource, onChange]
  );

  const updateLabels = useCallback(
    (labels: Record<string, string>) => {
      onChange({
        ...resource,
        metadata: { ...resource.metadata, labels },
      });
    },
    [resource, onChange]
  );

  const updateAnnotations = useCallback(
    (annotations: Record<string, string>) => {
      onChange({
        ...resource,
        metadata: { ...resource.metadata, annotations },
      });
    },
    [resource, onChange]
  );

  return {
    updateMetadata,
    updateSpec,
    updateNestedPath,
    updateLabels,
    updateAnnotations,
  };
}

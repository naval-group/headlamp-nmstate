import { Icon } from '@iconify/react';
import { ApiProxy } from '@kinvolk/headlamp-plugin/lib';
import {
  Alert,
  Box,
  Breadcrumbs,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Link,
  Paper,
  Typography,
} from '@mui/material';
import React, { useEffect, useState } from 'react';

interface CRDDocsViewerProps {
  apiVersion: string;
  kind: string;
}

interface CRDProperty {
  type?: string;
  description?: string;
  properties?: Record<string, CRDProperty>;
  items?: CRDProperty;
  required?: string[];
  format?: string;
  pattern?: string;
  enum?: string[];
  default?: unknown;
  'x-kubernetes-int-or-string'?: boolean;
}

export default function CRDDocsViewer({ apiVersion, kind }: CRDDocsViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rootSchema, setRootSchema] = useState<Record<string, CRDProperty> | null>(null);
  const [crdName, setCrdName] = useState<string>('');
  const [path, setPath] = useState<string[]>([]); // Current navigation path

  useEffect(() => {
    async function fetchCRD() {
      try {
        setLoading(true);
        setError(null);

        const [group, version] = apiVersion.includes('/')
          ? apiVersion.split('/')
          : ['', apiVersion];

        const response = await ApiProxy.request(
          '/apis/apiextensions.k8s.io/v1/customresourcedefinitions'
        );

        const crds = response.items || [];
        const matchingCrd = crds.find((crd: Record<string, unknown>) => {
          const spec = crd.spec as Record<string, unknown> | undefined;
          const names = spec?.names as Record<string, unknown> | undefined;
          const crdGroup = spec?.group;
          const crdKind = names?.kind;
          return crdGroup === group && crdKind === kind;
        });

        if (!matchingCrd) {
          throw new Error(`CRD not found for ${kind} in group ${group}`);
        }

        const matchingMeta = (matchingCrd as Record<string, unknown>).metadata as Record<
          string,
          unknown
        >;
        setCrdName(matchingMeta.name as string);

        const matchingSpec = (matchingCrd as Record<string, unknown>).spec as Record<
          string,
          unknown
        >;
        const versions = (matchingSpec?.versions || []) as Array<Record<string, unknown>>;
        const matchingVersion = versions.find(v => v.name === version) || versions[0];

        const schema = matchingVersion?.schema as Record<string, unknown> | undefined;
        const openAPIV3Schema = schema?.openAPIV3Schema as Record<string, unknown> | undefined;
        if (!openAPIV3Schema) {
          throw new Error('No schema found in CRD');
        }

        setRootSchema((openAPIV3Schema.properties as Record<string, CRDProperty>) || {});
      } catch (err: unknown) {
        console.error('Failed to fetch CRD:', err);
        setError((err as Error).message || 'Failed to fetch CRD documentation');
      } finally {
        setLoading(false);
      }
    }

    fetchCRD();
  }, [apiVersion, kind]);

  const getCurrentSchema = (): Record<string, CRDProperty> => {
    if (!rootSchema) return {};

    let current: Record<string, CRDProperty> = rootSchema;
    for (const segment of path) {
      if (current[segment]) {
        if (current[segment].properties) {
          current = current[segment].properties;
        } else if (current[segment].items?.properties) {
          // Navigate into array items
          current = current[segment].items.properties;
        } else {
          // Dead end
          return {};
        }
      }
    }
    return current;
  };

  const getCurrentProperty = (): CRDProperty | null => {
    if (path.length === 0 || !rootSchema) return null;

    let current: Record<string, CRDProperty> = rootSchema;
    for (let i = 0; i < path.length - 1; i++) {
      if (current[path[i]]?.properties) {
        current = current[path[i]].properties;
      } else if (current[path[i]]?.items?.properties) {
        current = current[path[i]].items.properties;
      }
    }
    return current[path[path.length - 1]] || null;
  };

  const navigateTo = (propertyName: string) => {
    setPath([...path, propertyName]);
  };

  const navigateUp = (index: number) => {
    setPath(path.slice(0, index));
  };

  const goBack = () => {
    if (path.length > 0) {
      setPath(path.slice(0, -1));
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: 2,
        }}
      >
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Loading documentation...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          <Typography variant="body2">{error}</Typography>
        </Alert>
      </Box>
    );
  }

  if (!rootSchema) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">
          <Typography variant="body2">No schema available for this resource</Typography>
        </Alert>
      </Box>
    );
  }

  const currentSchema = getCurrentSchema();
  const currentProperty = getCurrentProperty();
  const properties = Object.entries(currentSchema);

  return (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1 }}>
          {kind}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          {apiVersion}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {crdName}
        </Typography>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* Breadcrumbs navigation */}
      {path.length > 0 && (
        <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
          <IconButton size="small" onClick={goBack} sx={{ border: 1, borderColor: 'divider' }}>
            <Icon icon="mdi:arrow-left" />
          </IconButton>
          <Breadcrumbs separator="›">
            <Link
              component="button"
              variant="body2"
              onClick={() => navigateUp(0)}
              sx={{ cursor: 'pointer', textDecoration: 'none' }}
            >
              {kind}
            </Link>
            {path.map((segment, index) => (
              <Link
                key={index}
                component="button"
                variant="body2"
                onClick={() => navigateUp(index + 1)}
                sx={{
                  cursor: 'pointer',
                  textDecoration: 'none',
                  fontWeight: index === path.length - 1 ? 'bold' : 'normal',
                }}
              >
                {segment}
              </Link>
            ))}
          </Breadcrumbs>
        </Box>
      )}

      {/* Current property description */}
      {currentProperty && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'action.hover' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>
              {path[path.length - 1]}
            </Typography>
            {currentProperty.type && (
              <Chip
                label={
                  currentProperty['x-kubernetes-int-or-string']
                    ? 'int-or-string'
                    : currentProperty.type
                }
                size="small"
                color="primary"
              />
            )}
            {currentProperty.format && (
              <Chip label={currentProperty.format} size="small" color="secondary" />
            )}
          </Box>
          {currentProperty.description && (
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {currentProperty.description}
            </Typography>
          )}
          {currentProperty.enum && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" fontWeight="bold" gutterBottom>
                Allowed values:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {currentProperty.enum.map(val => (
                  <Chip key={val} label={val} size="small" variant="outlined" />
                ))}
              </Box>
            </Box>
          )}
          {currentProperty.pattern && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" fontWeight="bold">
                Pattern:
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                {currentProperty.pattern}
              </Typography>
            </Box>
          )}
          {currentProperty.default !== undefined && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" fontWeight="bold">
                Default:
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.5 }}>
                {JSON.stringify(currentProperty.default)}
              </Typography>
            </Box>
          )}
        </Paper>
      )}

      {/* Properties list */}
      {properties.length === 0 ? (
        <Alert severity="info">
          <Typography variant="body2">No sub-properties available for this field.</Typography>
        </Alert>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="overline" color="text.secondary" sx={{ mb: 1 }}>
            {path.length === 0 ? 'Top-level properties' : 'Properties'}
          </Typography>
          {properties.map(([name, prop]) => {
            const hasChildren =
              prop.properties || (prop.type === 'array' && prop.items?.properties);
            const isRequired = currentProperty?.required?.includes(name);

            return (
              <Paper
                key={name}
                variant="outlined"
                sx={{
                  p: 2,
                  cursor: hasChildren ? 'pointer' : 'default',
                  transition: 'all 0.2s',
                  '&:hover': hasChildren
                    ? {
                        bgcolor: 'action.hover',
                        borderColor: 'primary.main',
                      }
                    : {},
                }}
                onClick={() => hasChildren && navigateTo(name)}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                    {name}
                  </Typography>
                  {prop.type && (
                    <Chip
                      label={prop['x-kubernetes-int-or-string'] ? 'int-or-string' : prop.type}
                      size="small"
                      variant="outlined"
                      color="primary"
                    />
                  )}
                  {isRequired && <Chip label="required" size="small" color="error" />}
                  {hasChildren && <Icon icon="mdi:chevron-right" style={{ marginLeft: 'auto' }} />}
                </Box>
                {prop.description && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {prop.description}
                  </Typography>
                )}
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

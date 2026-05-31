import type {
  OpenApiComponentSection,
  OpenApiComponents,
  OpenApiSchema,
} from "./mvp-a-policy-as-code-types.js";

const openApiMethods = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);
const openApiOperationMetadataKeys = [
  "operationId",
  "summary",
  "description",
] as const;

export function collectOpenApiOperationSurfaces(
  pathItem: unknown,
  components: OpenApiComponents,
): { kind: "metadata" | "parameter"; value: string }[] {
  if (!isRecord(pathItem)) {
    return [];
  }

  const operationSurfaces: { kind: "metadata" | "parameter"; value: string }[] =
    [];
  for (const parameterName of collectOpenApiParameterNames(
    pathItem.parameters,
    components,
  )) {
    operationSurfaces.push({ kind: "parameter", value: parameterName });
  }

  for (const [method, operation] of Object.entries(pathItem)) {
    if (!openApiMethods.has(method) || !isRecord(operation)) {
      continue;
    }

    for (const key of openApiOperationMetadataKeys) {
      const value = operation[key];
      if (typeof value === "string") {
        operationSurfaces.push({ kind: "metadata", value });
      }
    }

    const tags = operation.tags;
    if (Array.isArray(tags)) {
      for (const tag of tags) {
        if (typeof tag === "string") {
          operationSurfaces.push({ kind: "metadata", value: tag });
        }
      }
    }

    for (const parameterName of collectOpenApiParameterNames(
      operation.parameters,
      components,
    )) {
      operationSurfaces.push({ kind: "parameter", value: parameterName });
    }
  }

  return operationSurfaces;
}

export function isMvpAOnboardingRoute(route: string): boolean {
  return (
    route === "/onboarding" ||
    route.startsWith("/onboarding/") ||
    route === "/audit/mvp-a/onboarding-correlations" ||
    route.startsWith("/audit/mvp-a/onboarding-correlations/") ||
    route === "/support/mvp-a/onboarding-reviews" ||
    route.startsWith("/support/mvp-a/onboarding-reviews/")
  );
}

export function collectOnboardingSchemaNames(
  pathItems: readonly unknown[],
  components: OpenApiComponents,
): Set<string> {
  const schemas = components.schemas ?? {};
  const schemaNames = new Set(
    Object.keys(schemas).filter((schemaName) =>
      schemaName.includes("Onboarding"),
    ),
  );
  const pendingSchemaNames = [
    ...schemaNames,
    ...pathItems.flatMap((pathItem) =>
      collectOpenApiSchemaRefs(pathItem, components),
    ),
  ];
  const processedSchemaNames = new Set<string>();

  while (pendingSchemaNames.length > 0) {
    const schemaName = pendingSchemaNames.pop();
    if (
      schemaName === undefined ||
      processedSchemaNames.has(schemaName) ||
      schemas[schemaName] === undefined
    ) {
      continue;
    }

    processedSchemaNames.add(schemaName);
    schemaNames.add(schemaName);
    pendingSchemaNames.push(
      ...collectOpenApiSchemaRefs(schemas[schemaName], components),
    );
  }

  return schemaNames;
}

export function collectOpenApiSchemaPropertyNames(
  schema: OpenApiSchema | undefined,
  components: OpenApiComponents,
): string[] {
  const propertyNames: string[] = [];

  function visitSchema(
    currentSchema: OpenApiSchema | undefined,
    visitedComponentRefs: ReadonlySet<string>,
  ): void {
    if (currentSchema === undefined) {
      return;
    }

    const componentRef = getOpenApiComponentRef(currentSchema.$ref);
    if (componentRef !== undefined) {
      const refKey = getOpenApiComponentRefKey(componentRef);
      if (!visitedComponentRefs.has(refKey)) {
        visitSchema(
          getOpenApiComponentValue(componentRef, components) as
            | OpenApiSchema
            | undefined,
          new Set([...visitedComponentRefs, refKey]),
        );
      }
    }

    for (const [propertyName, propertySchema] of Object.entries(
      currentSchema.properties ?? {},
    )) {
      propertyNames.push(propertyName);
      visitSchema(propertySchema, visitedComponentRefs);
    }

    visitSchema(currentSchema.items, visitedComponentRefs);
    for (const nestedSchema of [
      ...(currentSchema.allOf ?? []),
      ...(currentSchema.anyOf ?? []),
      ...(currentSchema.oneOf ?? []),
    ]) {
      visitSchema(nestedSchema, visitedComponentRefs);
    }
  }

  visitSchema(schema, new Set());
  return propertyNames;
}

export function collectOpenApiSchemaPropertyNamesFromValue(
  value: unknown,
  components: OpenApiComponents,
  visitedComponentRefs: ReadonlySet<string> = new Set(),
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      collectOpenApiSchemaPropertyNamesFromValue(
        item,
        components,
        visitedComponentRefs,
      ),
    );
  }

  if (!isRecord(value)) {
    return [];
  }

  const componentRef = getOpenApiComponentRef(value.$ref);
  if (componentRef !== undefined) {
    const refKey = getOpenApiComponentRefKey(componentRef);
    if (visitedComponentRefs.has(refKey)) {
      return [];
    }

    return collectOpenApiSchemaPropertyNamesFromValue(
      getOpenApiComponentValue(componentRef, components),
      components,
      new Set([...visitedComponentRefs, refKey]),
    );
  }

  const propertyNames = isOpenApiSchemaLike(value)
    ? collectOpenApiSchemaPropertyNames(value, components)
    : [];

  for (const nestedValue of Object.values(value)) {
    propertyNames.push(
      ...collectOpenApiSchemaPropertyNamesFromValue(
        nestedValue,
        components,
        visitedComponentRefs,
      ),
    );
  }

  return propertyNames;
}

function collectOpenApiParameterNames(
  parameters: unknown,
  components: OpenApiComponents,
): string[] {
  if (!Array.isArray(parameters)) {
    return [];
  }

  return parameters.flatMap((parameter) =>
    collectOpenApiParameterNamesFromValue(parameter, components, new Set()),
  );
}

function collectOpenApiSchemaRefs(
  value: unknown,
  components: OpenApiComponents,
  visitedComponentRefs: ReadonlySet<string> = new Set(),
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      collectOpenApiSchemaRefs(item, components, visitedComponentRefs),
    );
  }

  if (!isRecord(value)) {
    return [];
  }

  const refs: string[] = [];
  const componentRef = getOpenApiComponentRef(value.$ref);
  if (componentRef !== undefined) {
    if (componentRef.section === "schemas") {
      refs.push(componentRef.name);
    }

    const refKey = getOpenApiComponentRefKey(componentRef);
    if (!visitedComponentRefs.has(refKey)) {
      refs.push(
        ...collectOpenApiSchemaRefs(
          getOpenApiComponentValue(componentRef, components),
          components,
          new Set([...visitedComponentRefs, refKey]),
        ),
      );
    }
  }

  for (const nestedValue of Object.values(value)) {
    refs.push(
      ...collectOpenApiSchemaRefs(
        nestedValue,
        components,
        visitedComponentRefs,
      ),
    );
  }

  return refs;
}

function collectOpenApiParameterNamesFromValue(
  value: unknown,
  components: OpenApiComponents,
  visitedComponentRefs: ReadonlySet<string>,
): string[] {
  if (!isRecord(value)) {
    return [];
  }

  const componentRef = getOpenApiComponentRef(value.$ref);
  if (componentRef !== undefined) {
    const refKey = getOpenApiComponentRefKey(componentRef);
    if (visitedComponentRefs.has(refKey)) {
      return [];
    }

    return collectOpenApiParameterNamesFromValue(
      getOpenApiComponentValue(componentRef, components),
      components,
      new Set([...visitedComponentRefs, refKey]),
    );
  }

  return typeof value.name === "string" ? [value.name] : [];
}

function getOpenApiComponentRef(
  ref: unknown,
): { section: OpenApiComponentSection; name: string } | undefined {
  const componentRefPrefix = "#/components/";
  if (typeof ref !== "string" || !ref.startsWith(componentRefPrefix)) {
    return undefined;
  }

  const [section, name, ...rest] = ref
    .slice(componentRefPrefix.length)
    .split("/");
  if (
    rest.length > 0 ||
    !isOpenApiComponentSection(section) ||
    name === undefined
  ) {
    return undefined;
  }

  return {
    section,
    name: decodeJsonPointerSegment(name),
  };
}

function getOpenApiComponentValue(
  componentRef: { section: OpenApiComponentSection; name: string },
  components: OpenApiComponents,
): unknown {
  return components[componentRef.section]?.[componentRef.name];
}

function getOpenApiComponentRefKey(componentRef: {
  section: OpenApiComponentSection;
  name: string;
}): string {
  return `${componentRef.section}/${componentRef.name}`;
}

function isOpenApiComponentSection(
  section: string,
): section is OpenApiComponentSection {
  return (
    section === "schemas" ||
    section === "parameters" ||
    section === "requestBodies"
  );
}

function decodeJsonPointerSegment(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

function isOpenApiSchemaLike(value: Record<string, unknown>): boolean {
  return (
    typeof value.$ref === "string" ||
    isRecord(value.properties) ||
    isRecord(value.items) ||
    Array.isArray(value.allOf) ||
    Array.isArray(value.anyOf) ||
    Array.isArray(value.oneOf)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

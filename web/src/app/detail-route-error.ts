import { ApiClientError } from "../api-client";

export function detailRouteErrorMessage(
  caught: unknown,
  messages: {
    client: string;
    service: string;
    network: string;
  },
) {
  if (!(caught instanceof ApiClientError)) {
    return messages.network;
  }
  return caught.status !== undefined &&
    caught.status >= 400 &&
    caught.status < 500
    ? messages.client
    : messages.service;
}

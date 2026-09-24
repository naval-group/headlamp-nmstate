FROM node:25-alpine@sha256:bdf2cca6fe3dabd014ea60163eca3f0f7015fbd5c7ee1b0e9ccb4ced6eb02ef4 AS builder

WORKDIR /plugin

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Init-container image: started by Headlamp's Pod and copies the plugin files
# into a shared emptyDir at /headlamp/plugins/.
FROM busybox:latest@sha256:dc2d74b28e4cf8984fa52af1f39bc7c3d9c73760b41a74d629f5d11b1ab28616 AS busybox

COPY --from=builder /plugin/dist /plugins/nmstate/
COPY --from=builder /plugin/package.json /plugins/nmstate/

LABEL org.opencontainers.image.source=https://github.com/naval-group/headlamp-nmstate
LABEL org.opencontainers.image.licenses=Apache-2.0
LABEL org.opencontainers.image.description="Headlamp NMState plugin (init-container image for Headlamp in-cluster install)"

USER 1001

CMD ["sh", "-c", "echo Plugins installed at /plugins/; ls /plugins/"]

# File-only image for the Kubernetes image volume source.
# https://kubernetes.io/docs/concepts/storage/volumes/#image
# The plugin's main.js and package.json sit at the image root; mount the
# volume at the desired plugin sub-directory (e.g. /headlamp/plugins/nmstate).
FROM scratch AS oci

COPY --from=builder /plugin/dist/main.js /main.js
COPY --from=builder /plugin/package.json /package.json

LABEL org.opencontainers.image.source=https://github.com/naval-group/headlamp-nmstate
LABEL org.opencontainers.image.licenses=Apache-2.0
LABEL org.opencontainers.image.description="Headlamp NMState plugin (file-only image for Kubernetes image volume)"

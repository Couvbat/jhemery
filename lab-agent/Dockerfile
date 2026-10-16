# The lab agent as an image, for a host that would rather run one than mount the folder
# (compose.example.yaml shows the mount, which needs no build at all). No dependencies,
# so nothing is installed: the official image, the modules, a non-root user. No port is
# exposed, because the agent only makes outbound requests.
FROM node:22-alpine
WORKDIR /app
COPY *.mjs ./
USER node
CMD ["node", "/app/agent.mjs"]

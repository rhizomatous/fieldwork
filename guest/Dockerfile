FROM i386/alpine:3.22
ADD .cache/package/dist/wanix-linux.tgz /
RUN apk add --no-cache nodejs bash && mkdir -p /opt/agent /bridge /project
COPY .cache/agent.bundle.mjs /opt/agent/agent.bundle.mjs
COPY .cache/pi-assets /opt/agent/pi
COPY guest/rc /boot/rc
ENV PATH="/opt/agent/node_modules/.bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ENV PI_PACKAGE_DIR="/opt/agent/pi"
CMD ["/bin/sh"]

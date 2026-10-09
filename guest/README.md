# Fieldwork guest machine

This directory contains tools to configure the Fieldwork Linux VM. This VM contains Fieldwork's LLM agent.

The agent is a simple [Pi](https://pi.dev/) harness. It's not built to be particularly flexible or durable, it's hardwired to work with this demo project specifically.

The VM filesystem is configured with Docker. There's no container at runtime, though. This Dockerfile is only used to set up the root Linux filesystem that will be loaded as a VM by Wanix in the browser.

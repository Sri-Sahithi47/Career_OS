package com.jobportal.dashboard;

import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/** Drain output while enforcing a deadline and retaining only a bounded tail. */
final class ProcessRunner {
  record Result(int exitCode, String output) {}

  static Result collect(Process process, long timeoutSeconds) throws IOException, InterruptedException {
    StringBuilder tail = new StringBuilder();
    Thread reader = new Thread(() -> {
      try (var in = new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8)) {
        char[] buffer = new char[2048];
        int count;
        while ((count = in.read(buffer)) != -1) {
          synchronized (tail) {
            tail.append(buffer, 0, count);
            if (tail.length() > 5000) tail.delete(0, tail.length() - 5000);
          }
        }
      } catch (IOException ignored) { /* The process stream closes during cancellation. */ }
    }, "scraper-output");
    reader.setDaemon(true);
    reader.start();
    try {
      if (!process.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
        throw new IOException("Portal scrape timed out after " + timeoutSeconds + " seconds. Retry this portal.");
      }
      reader.join(2000);
      synchronized (tail) {
        return new Result(process.exitValue(), tail.toString().trim());
      }
    } finally {
      process.descendants().forEach(ProcessHandle::destroyForcibly);
      if (process.isAlive()) process.destroyForcibly();
      process.waitFor(5, TimeUnit.SECONDS);
      process.getInputStream().close();
    }
  }
}

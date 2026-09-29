package com.jobportal.dashboard;

import org.junit.jupiter.api.Test;
import java.io.IOException;
import java.time.Duration;
import static org.assertj.core.api.Assertions.*;

class ProcessRunnerTest {
  @Test
  void drainsLargeOutputWithoutBlockingAndRetainsOnlyTail() throws Exception {
    Process p = new ProcessBuilder("python3", "-c", "print('x' * 200000); print('END-MARKER')")
        .redirectErrorStream(true).start();
    ProcessRunner.Result result = ProcessRunner.collect(p, 10);
    assertThat(result.exitCode()).isZero();
    assertThat(result.output()).endsWith("END-MARKER");
    assertThat(result.output().length()).isLessThanOrEqualTo(5000);
  }

  @Test
  void hungProcessIsKilledAtDeadline() throws Exception {
    Process p = new ProcessBuilder("python3", "-c", "import time; time.sleep(60)").start();
    org.junit.jupiter.api.Assertions.assertTimeoutPreemptively(Duration.ofSeconds(8), () -> {
      assertThatThrownBy(() -> ProcessRunner.collect(p, 1))
          .isInstanceOf(IOException.class).hasMessageContaining("timed out");
    });
    assertThat(p.isAlive()).isFalse();
  }
}

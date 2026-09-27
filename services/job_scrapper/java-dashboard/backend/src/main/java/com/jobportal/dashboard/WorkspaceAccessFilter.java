package com.jobportal.dashboard;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Internal companion requests are authenticated by the CareerOS API. */
@Component
public class WorkspaceAccessFilter extends OncePerRequestFilter {
  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
      FilterChain chain) throws ServletException, IOException {
    String secret = System.getProperty("dashboard.token", "");
    String supplied = request.getHeader("X-Workspace-Token");
    if (!secret.isEmpty() && (supplied == null || !MessageDigest.isEqual(
        secret.getBytes(StandardCharsets.UTF_8), supplied.getBytes(StandardCharsets.UTF_8)))) {
      response.sendError(401);
      return;
    }
    chain.doFilter(request, response);
  }
}

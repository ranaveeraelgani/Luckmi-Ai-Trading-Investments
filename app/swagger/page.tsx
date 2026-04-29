"use client";

import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-[#0B0F17] p-4">
      <SwaggerUI
        url="/api/swagger"
        requestInterceptor={(req) => {
          const token = localStorage.getItem("token");
          if (token) {
            req.headers["Authorization"] = `Bearer ${token}`;
          }
          return req;
        }}
      />
    </div>
  );
}
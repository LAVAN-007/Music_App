# Builds the UI and the server into one small image that serves both on $PORT.

FROM node:22-alpine AS ui
WORKDIR /ui
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npx vite build --outDir /ui/static --emptyOutDir

FROM maven:3.9-eclipse-temurin-21 AS server
WORKDIR /build
COPY backend/music-sync-backend/pom.xml ./
RUN mvn -q -B dependency:go-offline
COPY backend/music-sync-backend/src ./src
COPY --from=ui /ui/static ./src/main/resources/static
RUN mvn -q -B package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=server /build/target/music-sync-backend-0.0.1-SNAPSHOT.jar app.jar
# Sized for a 512 MB free instance.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=65 -XX:+UseSerialGC -Xss512k"
EXPOSE 8080
CMD ["java", "-jar", "app.jar"]

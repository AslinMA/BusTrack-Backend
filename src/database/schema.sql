 -- Enable PostGIS extension for geographic queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Drop existing tables if any (for fresh start)
DROP TABLE IF EXISTS bus_locations CASCADE;
DROP TABLE IF EXISTS route_stops CASCADE;
DROP TABLE IF EXISTS buses CASCADE;
DROP TABLE IF EXISTS bus_stops CASCADE;
DROP TABLE IF EXISTS bus_routes CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users table
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('passenger', 'driver', 'admin')),
    full_name VARCHAR(100),
    password_hash VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bus routes table
CREATE TABLE bus_routes (
    route_id SERIAL PRIMARY KEY,
    route_number VARCHAR(20) NOT NULL UNIQUE,
    route_name VARCHAR(200) NOT NULL,
    start_location VARCHAR(100) NOT NULL,
    end_location VARCHAR(100) NOT NULL,
    total_distance_km DECIMAL(6,2),
    avg_duration_minutes INT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bus stops table with geographic data
CREATE TABLE bus_stops (
    stop_id SERIAL PRIMARY KEY,
    stop_name VARCHAR(100) NOT NULL,
    stop_name_si VARCHAR(100),
    stop_name_ta VARCHAR(100),
    location GEOMETRY(Point, 4326) NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create spatial index for faster geographic queries
CREATE INDEX idx_stop_location ON bus_stops USING GIST(location);

-- Route stops junction table
CREATE TABLE route_stops (
    id SERIAL PRIMARY KEY,
    route_id INT REFERENCES bus_routes(route_id) ON DELETE CASCADE,
    stop_id INT REFERENCES bus_stops(stop_id) ON DELETE CASCADE,
    stop_sequence INT NOT NULL,
    distance_from_start_km DECIMAL(6,2),
    estimated_time_minutes INT,
    UNIQUE(route_id, stop_sequence),
    UNIQUE(route_id, stop_id)
);

-- Buses table
CREATE TABLE buses (
    bus_id SERIAL PRIMARY KEY,
    bus_number VARCHAR(20) UNIQUE NOT NULL,
    route_id INT REFERENCES bus_routes(route_id) ON DELETE SET NULL,
    driver_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    driver_name VARCHAR(100),
    driver_phone VARCHAR(15),
    capacity INT DEFAULT 50,
    bus_type VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    is_tracking BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bus locations table
CREATE TABLE bus_locations (
    location_id SERIAL PRIMARY KEY,
    bus_id INT REFERENCES buses(bus_id) ON DELETE CASCADE,
    location GEOMETRY(Point, 4326) NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    speed_kmh DECIMAL(5,2) DEFAULT 0,
    heading INT DEFAULT 0,
    accuracy_meters DECIMAL(6,2),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_bus_locations_bus_time ON bus_locations(bus_id, timestamp DESC);
CREATE INDEX idx_bus_locations_geom ON bus_locations USING GIST(location);
CREATE INDEX idx_bus_locations_timestamp ON bus_locations(timestamp DESC);

-- Insert sample route
INSERT INTO bus_routes (route_number, route_name, start_location, end_location, total_distance_km, avg_duration_minutes)
VALUES ('223', 'Panadura - Horana - Mathugama', 'Panadura', 'Mathugama', 45.5, 75);

-- Insert bus stops
INSERT INTO bus_stops (stop_name, stop_name_si, latitude, longitude, location, address) VALUES
('Panadura Bus Stand', 'පානදුර බස් නැවතුම', 6.7133, 79.9077, ST_GeomFromText('POINT(79.9077 6.7133)', 4326), 'Panadura Town'),
('Panadura Junction', 'පානදුර හංදිය', 6.7156, 79.9045, ST_GeomFromText('POINT(79.9045 6.7156)', 4326), 'Galle Road, Panadura'),
('Wadduwa', 'වාද්දුව', 6.6634, 79.9287, ST_GeomFromText('POINT(79.9287 6.6634)', 4326), 'Wadduwa Town'),
('Kalutara North', 'කළුතර උතුර', 6.5853, 79.9607, ST_GeomFromText('POINT(79.9607 6.5853)', 4326), 'Kalutara North'),
('Kalutara South', 'කළුතර දකුණ', 6.5754, 79.9591, ST_GeomFromText('POINT(79.9591 6.5754)', 4326), 'Kalutara South'),
('Horana', 'හොරණ', 6.7156, 80.0632, ST_GeomFromText('POINT(80.0632 6.7156)', 4326), 'Horana Town'),
('Ingiriya', 'ඉඟිරිය', 6.7324, 80.1187, ST_GeomFromText('POINT(80.1187 6.7324)', 4326), 'Ingiriya Junction'),
('Bulathsinhala', 'බුලත්සිංහල', 6.7245, 80.2012, ST_GeomFromText('POINT(80.2012 6.7245)', 4326), 'Bulathsinhala Town'),
('Mathugama', 'මාතුගම', 6.5324, 80.1287, ST_GeomFromText('POINT(80.1287 6.5324)', 4326), 'Mathugama Bus Stand');

-- Link route to stops
INSERT INTO route_stops (route_id, stop_id, stop_sequence, distance_from_start_km, estimated_time_minutes) VALUES
(1, 1, 1, 0, 0),
(1, 2, 2, 2.5, 5),
(1, 3, 3, 8.0, 15),
(1, 4, 4, 14.5, 25),
(1, 5, 5, 16.0, 28),
(1, 6, 6, 28.5, 45),
(1, 7, 7, 35.0, 55),
(1, 8, 8, 42.0, 68),
(1, 9, 9, 45.5, 75);

-- Insert test buses
INSERT INTO buses (bus_number, route_id, driver_name, driver_phone, capacity, bus_type) VALUES
('NA-1234', 1, 'Nimal Perera', '0771234567', 50, 'regular'),
('WP-5678', 1, 'Sunil Fernando', '0775551234', 45, 'regular'),
('KA-9012', 1, 'Anil Jayawardena', '0773334567', 52, 'semi-luxury');


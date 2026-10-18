
import bcrypt from "bcryptjs";
import User from "../models/User.js";

export async function registerUser(req, res) {
  try {
    const { name, email, password } = req.body ?? {};

    // Validate the name.
    if (
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 80
    ) {
      return res.status(400).json({
        success: false,
        message: "Name must contain between 2 and 80 characters",
      });
    }

    // Validate the email.
    if (
      typeof email !== "string" ||
      email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address",
      });
    }

    // Validate the password.
    if (
      typeof password !== "string" ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters and at most 72 UTF-8 bytes",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check for an existing account.
    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    // Hash the password; never store the original password.
    const passwordHash = await bcrypt.hash(password, 12);

    // Do not accept a role from the request body.
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
    });

    return res.status(201).json({
      success: true,
      message: "Account registered successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    // Handle duplicate-key errors, including concurrent registrations.
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    // Log details on the server, but do not expose internal errors.
    console.error("Registration error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to register account",
    });
  }
}



export async function loginUser(req, res) {
  try {
    const { email, password } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      email.trim().length > 254 ||
      password.length === 0 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email and password"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail
    }).select("+passwordHash");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    // Regenerate the session ID after authentication.
    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    // Store only the user ID in the session.
    req.session.userId = user._id.toString();

    // Persist the session before sending the response.
    await new Promise((resolve, reject) => {
      req.session.save((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to log in"
    });
  }
}

export async function logoutUser(req, res) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  };

  if (!req.session) {
    res.clearCookie("findora.sid", cookieOptions);

    return res.status(200).json({
      success: true,
      message: "Logged out successfully"
    });
  }

  req.session.destroy((error) => {
    res.clearCookie("findora.sid", cookieOptions);

    if (error) {
      console.error("Logout error:", error.message);

      return res.status(500).json({
        success: false,
        message: "Unable to log out"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Logged out successfully"
    });
  });
}

export async function getCurrentUser(req, res) {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const user = await User.findById(req.session.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Current-user lookup error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve current user"
    });
  }
}


export function getCsrfToken(req, res) {
  const token = req.csrfToken();

  res.status(200).json({
    success: true,
    csrfToken: token,
  });
}


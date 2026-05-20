import Complaint from "../models/Complaint.js";
import Property from "../models/Property.js";


export const submitComplaint = async (req, res) => {
  try {
    const { name, email, propertyId, subject, complaint } = req.body;
    if (!name || !email || !propertyId || !subject || !complaint) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // Get property to find owner
    const property = await Property.findById(propertyId);
    if (!property) {
      return res.status(404).json({ success: false, message: "Property not found" });
    }

    const newComplaint = new Complaint({
      name,
      email,
      propertyId,
      ownerId: property.ownerId, // assign ownerId here
      subject,
      complaint,
      status: "pending",
    });

    await newComplaint.save();
    res.status(201).json({ success: true, message: "Complaint submitted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to submit complaint" });
  }
};



// Get all complaints (for admin/owner)
export const getAllComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find().sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch complaints" });
  }
};

// Get complaints for a specific user
export const getUserComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ email: req.params.email }).sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch complaints" });
  }
};

// Mark complaint as resolved
export const resolveComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findByIdAndUpdate(
      req.params.id,
      { status: "resolved" },
      { new: true }
    );

    if (!complaint) return res.status(404).json({ success: false, message: "Complaint not found" });

    res.json({ success: true, complaint });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to update complaint" });
  }
};



export const getOwnerComplaints = async (req, res) => {
    try {
      const ownerId = req.user._id;
  
      const complaints = await Complaint.find({ ownerId })
        .populate("property", "title address"); // only title & address
  
      res.status(200).json(complaints);
    } catch (err) {
      console.error("Error fetching owner complaints:", err.message);
      res.status(500).json({ error: "Failed to fetch complaints" });
    }
  };


  
  
  
  
  



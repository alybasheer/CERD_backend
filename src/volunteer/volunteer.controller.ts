import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApplyVolunteerDto } from './dto/apply-volunteer.dto';
import { VolunteerMediaService } from './volunteer-media.service';
import { VolunteerService } from './volunteer.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('volunteer')
@UseGuards(JwtAuthGuard)
export class VolunteerController {
  constructor(
    private readonly volunteerService: VolunteerService,
    private readonly jwtService: JwtService,
    private readonly mediaService: VolunteerMediaService,
  ) {}

  private verifyTokenAndGetPayload(authHeader: string) {
    if (!authHeader)
      throw new UnauthorizedException('Authorization header required');
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const payload: any = this.jwtService.verify(token);
    return payload;
  }

  @Post('media')
  @UseInterceptors(
    FilesInterceptor('files', 3, {
      limits: { files: 3, fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadMedia(
    @Headers('authorization') auth: string,
    @UploadedFiles() files: any[],
    @Req() req: any,
  ) {
    this.verifyTokenAndGetPayload(auth);
    if (!files?.length) {
      throw new BadRequestException('At least one media file is required');
    }

    const mediaUrls = await this.mediaService.upload(
      files,
      this.resolveBaseUrl(req),
    );

    return {
      success: true,
      message: 'Volunteer documents uploaded',
      data: { mediaUrls },
    };
  }

  @Post('apply')
  async apply(
    @Headers('authorization') auth: string,
    @Body() body: ApplyVolunteerDto,
  ) {
    const payload = this.verifyTokenAndGetPayload(auth);
    const userId = payload.sub;
    // require necessary fields
    const {
      name,
      city,
      location,
      expertise,
      reason,
      cnic,
      cnicFrontImage,
      cnicBackImage,
      profileImage,
      latitude,
      longitude,
    } = body;
    if (
      !name ||
      !city ||
      !location ||
      !expertise ||
      !reason ||
      !cnic ||
      !cnicFrontImage ||
      !cnicBackImage
    ) {
      throw new BadRequestException('Missing required application fields');
    }
    const application = await this.volunteerService.createApplication(userId, {
      name,
      city,
      location,
      expertise,
      reason,
      cnic,
      cnicFrontImage,
      cnicBackImage,
      profileImage,
      latitude,
      longitude,
    });
    return {
      success: true,
      message: 'Application submitted successfully',
      data: application,
    };
  }

  @Get('my-application')
  async myApplications(@Headers('authorization') auth: string) {
    const payload = this.verifyTokenAndGetPayload(auth);
    const userId = payload.sub;
    const applications = await this.volunteerService.findByUser(userId);
    return {
      success: true,
      data: applications,
    };
  }

  @Get('status')
  async getVolunteerStatus(@Headers('authorization') auth: string) {
    const payload = this.verifyTokenAndGetPayload(auth);
    const userId = payload.sub;

 const data = await this.volunteerService.getVolunteerStatus(userId);

return {
  status: 'success',
  data,
};

  }

  @Get('media/:id')
  async getMedia(
    @Headers('authorization') auth: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    this.verifyTokenAndGetPayload(auth);
    const media = await this.mediaService.openDownloadStream(id);

    res.setHeader('Content-Type', media.contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    media.stream.pipe(res);
  }

  private resolveBaseUrl(req: any) {
    const configuredBaseUrl = process.env.PUBLIC_BASE_URL?.trim();
    if (configuredBaseUrl) {
      return configuredBaseUrl.replace(/\/$/, '');
    }

    const protocol =
      req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${protocol}://${host}`;
  }
}

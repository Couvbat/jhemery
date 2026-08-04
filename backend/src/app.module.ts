import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AskModule } from './ask/ask.module';
import { ContactModule } from './contact/contact.module';
import { SteamModule } from './steam/steam.module';
import { GithubModule } from './github/github.module';
import { GuestbookModule } from './guestbook/guestbook.module';
import { WeatherModule } from './weather/weather.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AskModule,
    ContactModule,
    SteamModule,
    GithubModule,
    GuestbookModule,
    WeatherModule,
  ],
})
export class AppModule {}
